"""
JARVIS — Long-Term Memory (Vector DB)
=======================================
Powered by Pinecone. Stores and retrieves all interactions,
user preferences, business rules, and learned patterns.
This is what makes Jarvis smarter with every interaction.
"""

import json
import logging
import hashlib
from datetime import datetime
from typing import Any

from pinecone import Pinecone, ServerlessSpec
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from openai import AsyncOpenAI     # used only for text embeddings (ada-002 / text-3-small)

from config.settings import settings

logger = logging.getLogger("jarvis.memory")


class JarvisMemory:
    """
    Vector-backed long-term memory.
    Stores every interaction. Retrieves semantically relevant past context.
    Continuously extracts user preferences and business rules.
    """

    NAMESPACE_INTERACTIONS  = "interactions"
    NAMESPACE_PREFERENCES   = "preferences"
    NAMESPACE_BUSINESS_RULES = "business_rules"

    def __init__(self):
        self.pc     = Pinecone(api_key=settings.PINECONE_API_KEY)
        self.oai    = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)  # embeddings only
        self.llm    = ChatAnthropic(model="claude-haiku-4-5",
                                    api_key=settings.ANTHROPIC_API_KEY)
        self.index  = self._init_index()

    def _init_index(self):
        """Creates the Pinecone index if it doesn't exist."""
        index_name = settings.PINECONE_INDEX_NAME

        existing = [i.name for i in self.pc.list_indexes()]
        if index_name not in existing:
            logger.info(f"[MEMORY] Creating Pinecone index: {index_name}")
            self.pc.create_index(
                name=index_name,
                dimension=1536,     # text-embedding-3-small
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1")
            )

        return self.pc.Index(index_name)

    async def _embed(self, text: str) -> list[float]:
        """Generates a 1536-dim embedding using OpenAI text-embedding-3-small."""
        response = await self.oai.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000]    # truncate to model limit
        )
        return response.data[0].embedding

    async def store(self, interaction: dict, extract_preferences: bool = False):
        """
        Stores an interaction in the vector DB.
        Optionally runs an LLM pass to extract preferences/rules.
        """
        text = json.dumps(interaction)
        embedding = await self._embed(text)
        doc_id = hashlib.sha256(text.encode()).hexdigest()[:32]

        self.index.upsert(
            vectors=[{
                "id":       doc_id,
                "values":   embedding,
                "metadata": {
                    "task":      interaction.get("task", "")[:500],
                    "channel":   interaction.get("channel", ""),
                    "timestamp": interaction.get("timestamp", datetime.now().isoformat()),
                    "status":    str(interaction.get("status", "")),
                    "text":      text[:1000]    # store truncated for retrieval preview
                }
            }],
            namespace=self.NAMESPACE_INTERACTIONS
        )
        logger.info(f"[MEMORY] Stored interaction {doc_id[:12]}...")

        if extract_preferences:
            await self._extract_and_store_preferences(interaction)

    async def recall(self, query: str, top_k: int = 5, filters: dict = None) -> dict:
        """
        Semantic search over all stored memories.
        Returns the most relevant past interactions and preferences.
        """
        embedding = await self._embed(query)

        # Search interactions
        interaction_results = self.index.query(
            vector=embedding,
            top_k=top_k,
            namespace=self.NAMESPACE_INTERACTIONS,
            include_metadata=True
        )

        # Search preferences
        preference_results = self.index.query(
            vector=embedding,
            top_k=3,
            namespace=self.NAMESPACE_PREFERENCES,
            include_metadata=True
        )

        interactions = [m.metadata for m in interaction_results.matches if m.score > 0.7]
        preferences  = [m.metadata for m in preference_results.matches if m.score > 0.65]

        logger.info(f"[MEMORY] Recalled {len(interactions)} interactions, {len(preferences)} preferences.")

        return {
            "relevant_past_tasks":  interactions,
            "user_preferences":     preferences,
            "query":                query
        }

    async def store_preference(self, key: str, value: str, confidence: float = 1.0):
        """Explicitly stores a user preference."""
        text = f"PREFERENCE: {key} = {value}"
        embedding = await self._embed(text)
        doc_id = hashlib.sha256(text.encode()).hexdigest()[:32]

        self.index.upsert(
            vectors=[{
                "id":     doc_id,
                "values": embedding,
                "metadata": {
                    "type":       "preference",
                    "key":        key,
                    "value":      value,
                    "confidence": confidence,
                    "timestamp":  datetime.now().isoformat(),
                    "text":       text
                }
            }],
            namespace=self.NAMESPACE_PREFERENCES
        )

    async def _extract_and_store_preferences(self, interaction: dict):
        """
        Runs an LLM pass to extract implicit preferences from an interaction.
        Example: user consistently prefers short emails → store that.
        """
        prompt = f"""
Analyze this interaction and extract any implicit user preferences, work style patterns,
or business rules that should be remembered for future tasks.

Interaction:
{json.dumps(interaction, indent=2)}

Return a JSON array of preferences. Each item: {{"key": "...", "value": "...", "confidence": 0.0-1.0}}
Return empty array [] if no clear preferences are present.
Only extract things with confidence > 0.7.
"""
        try:
            response = await self.llm.ainvoke([HumanMessage(content=prompt)])
            raw = response.content
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()

            preferences = json.loads(raw)
            for pref in preferences:
                if pref.get("confidence", 0) > 0.7:
                    await self.store_preference(pref["key"], pref["value"], pref["confidence"])
                    logger.info(f"[MEMORY] Learned preference: {pref['key']} = {pref['value']}")

        except Exception as e:
            logger.warning(f"[MEMORY] Preference extraction failed: {e}")

    async def forget(self, doc_id: str, namespace: str = NAMESPACE_INTERACTIONS):
        """Removes a specific memory entry."""
        self.index.delete(ids=[doc_id], namespace=namespace)
        logger.info(f"[MEMORY] Deleted memory: {doc_id}")

    async def stats(self) -> dict:
        """Returns memory usage stats."""
        stats = self.index.describe_index_stats()
        return {
            "total_vectors":     stats.total_vector_count,
            "namespaces":        dict(stats.namespaces),
            "dimension":         stats.dimension
        }
