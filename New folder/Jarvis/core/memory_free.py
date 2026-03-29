"""
JARVIS — Free Memory (Chroma + Sentence-Transformers)
======================================================
Local vector DB. Zero cost. Runs on your machine.
Embeddings via HuggingFace (free).
"""

import logging
import json
from datetime import datetime
from typing import Any

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

logger = logging.getLogger("jarvis.memory_free")


class JarvisMemoryFree:
    """
    Vector DB using Chroma (free, open-source, embedded).
    Embeddings via sentence-transformers (free, local).
    """

    def __init__(self, persist_dir: str = "./jarvis_memory"):
        # Initialize Chroma (local, persisted)
        self.client = chromadb.Client(Settings(
            chroma_db_impl="duckdb+parquet",
            persist_directory=persist_dir,
            anonymized_telemetry=False
        ))

        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name="jarvis_interactions",
            metadata={"hnsw:space": "cosine"}
        )

        # Embeddings via sentence-transformers (free, 384-dim)
        # "all-MiniLM-L6-v2" is tiny and fast
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("[MEMORY] Chroma + Sentence-Transformers initialized (FREE)")

    async def store(self, interaction: dict, extract_preferences: bool = False):
        """Stores an interaction locally."""
        text = json.dumps(interaction)
        embedding = self.embedder.encode(text).tolist()

        doc_id = f"doc_{datetime.now().timestamp()}"

        self.collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[text[:2000]],
            metadatas=[{
                "task":      interaction.get("task", "")[:100],
                "channel":   interaction.get("channel", ""),
                "timestamp": interaction.get("timestamp", datetime.now().isoformat()),
                "status":    str(interaction.get("status", ""))
            }]
        )
        logger.info(f"[MEMORY] Stored: {doc_id}")

    async def recall(self, query: str, top_k: int = 5) -> dict:
        """Semantic search over stored interactions."""
        query_embedding = self.embedder.encode(query).tolist()

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )

        interactions = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                try:
                    data = json.loads(doc)
                    interactions.append(data)
                except:
                    pass

        logger.info(f"[MEMORY] Recalled {len(interactions)} interactions")
        return {
            "relevant_past_tasks": interactions,
            "user_preferences": [],
            "query": query
        }

    async def stats(self) -> dict:
        """Memory stats."""
        count = self.collection.count()
        return {
            "total_interactions": count,
            "embeddings_dim": 384,
            "model": "sentence-transformers/all-MiniLM-L6-v2"
        }
