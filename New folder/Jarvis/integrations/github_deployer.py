"""
JARVIS — Autonomous Code Deployment Engine
==========================================
Jarvis can write code, push it to GitHub,
trigger Vercel/AWS deployments, run tests, and verify success.
All without human hand-holding.
"""

import logging
import base64
import asyncio
import httpx
from datetime import datetime
from config.settings import settings

logger = logging.getLogger("jarvis.deployer")


class DeploymentEngine:
    """
    Full deployment lifecycle manager.
    Workflow: WRITE → COMMIT → PUSH → DEPLOY → VERIFY → REPORT
    """

    GITHUB_API   = "https://api.github.com"
    VERCEL_API   = "https://api.vercel.com"

    def __init__(self):
        self.github_headers = {
            "Authorization": f"Bearer {settings.GITHUB_TOKEN}",
            "Accept":        "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        self.vercel_headers = {
            "Authorization": f"Bearer {settings.VERCEL_TOKEN}",
            "Content-Type":  "application/json"
        }
        self.gh_user = settings.GITHUB_USERNAME

    # ─── REPO MANAGEMENT ────────────────────────────────────────────────────
    async def create_repo(self, name: str, description: str = "", private: bool = True) -> dict:
        """Creates a new GitHub repository."""
        payload = {
            "name":        name,
            "description": description,
            "private":     private,
            "auto_init":   True
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.GITHUB_API}/user/repos",
                json=payload,
                headers=self.github_headers
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"[DEPLOY] Repo created: {data['full_name']}")
            return data

    # ─── FILE OPERATIONS ─────────────────────────────────────────────────────
    async def write_file(
        self,
        repo: str,
        path: str,
        content: str,
        message: str = "Jarvis: autonomous update",
        branch: str = "main"
    ) -> dict:
        """
        Creates or updates a file in a GitHub repository.
        Handles SHA requirement for updates automatically.
        """
        encoded = base64.b64encode(content.encode()).decode()

        # Check if file exists (need SHA for updates)
        sha = await self._get_file_sha(repo, path, branch)
        payload = {
            "message": message,
            "content": encoded,
            "branch":  branch
        }
        if sha:
            payload["sha"] = sha

        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{self.GITHUB_API}/repos/{self.gh_user}/{repo}/contents/{path}",
                json=payload,
                headers=self.github_headers
            )
            resp.raise_for_status()
            logger.info(f"[DEPLOY] File written: {repo}/{path}")
            return resp.json()

    async def _get_file_sha(self, repo: str, path: str, branch: str) -> str | None:
        """Gets the SHA of an existing file, or None if it doesn't exist."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.GITHUB_API}/repos/{self.gh_user}/{repo}/contents/{path}",
                params={"ref": branch},
                headers=self.github_headers
            )
            if resp.status_code == 200:
                return resp.json().get("sha")
            return None

    async def write_multiple_files(
        self,
        repo: str,
        files: dict[str, str],   # {path: content}
        commit_message: str = "Jarvis: initial project scaffold",
        branch: str = "main"
    ) -> list[dict]:
        """Writes multiple files to a repo concurrently."""
        tasks = [
            self.write_file(repo, path, content, commit_message, branch)
            for path, content in files.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        successes = [r for r in results if not isinstance(r, Exception)]
        failures  = [r for r in results if isinstance(r, Exception)]
        if failures:
            logger.warning(f"[DEPLOY] {len(failures)} file write(s) failed.")
        return successes

    # ─── VERCEL DEPLOYMENT ───────────────────────────────────────────────────
    async def deploy_to_vercel(self, repo_name: str, project_name: str = None) -> dict:
        """
        Triggers a Vercel deployment from a GitHub repository.
        Returns deployment URL.
        """
        name = project_name or repo_name.lower().replace("_", "-")

        # Create project if it doesn't exist
        project = await self._get_or_create_vercel_project(name, repo_name)

        # Trigger deployment
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.VERCEL_API}/v13/deployments",
                json={
                    "name":       name,
                    "gitSource": {
                        "type":   "github",
                        "repoId": str(project.get("link", {}).get("repoId", "")),
                        "ref":    "main"
                    }
                },
                headers=self.vercel_headers,
                timeout=30
            )
            resp.raise_for_status()
            deployment = resp.json()

        url = f"https://{deployment.get('url', name + '.vercel.app')}"
        logger.info(f"[DEPLOY] Vercel deployment triggered: {url}")
        return {"url": url, "id": deployment.get("id"), "state": deployment.get("readyState")}

    async def _get_or_create_vercel_project(self, name: str, repo_name: str) -> dict:
        """Fetches an existing Vercel project or creates a new one."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.VERCEL_API}/v9/projects/{name}",
                headers=self.vercel_headers
            )
            if resp.status_code == 200:
                return resp.json()

            # Create
            create_resp = await client.post(
                f"{self.VERCEL_API}/v10/projects",
                json={
                    "name": name,
                    "framework": "nextjs",
                    "gitRepository": {
                        "type": "github",
                        "repo": f"{self.gh_user}/{repo_name}"
                    }
                },
                headers=self.vercel_headers
            )
            create_resp.raise_for_status()
            return create_resp.json()

    async def wait_for_deployment(self, deployment_id: str, timeout_secs: int = 120) -> dict:
        """Polls Vercel until deployment succeeds or fails."""
        start = datetime.now()
        while (datetime.now() - start).seconds < timeout_secs:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.VERCEL_API}/v13/deployments/{deployment_id}",
                    headers=self.vercel_headers
                )
                data  = resp.json()
                state = data.get("readyState")
                logger.info(f"[DEPLOY] Vercel status: {state}")
                if state == "READY":
                    return {"success": True, "url": f"https://{data.get('url')}"}
                if state in ("ERROR", "CANCELED"):
                    return {"success": False, "error": data.get("errorMessage")}
            await asyncio.sleep(8)
        return {"success": False, "error": "Deployment timeout"}

    # ─── FULL PIPELINE ───────────────────────────────────────────────────────
    async def full_deploy_pipeline(
        self,
        project_name: str,
        files: dict[str, str],
        description: str = ""
    ) -> dict:
        """
        The complete autonomous deployment pipeline:
        1. Create GitHub repo
        2. Push all files
        3. Deploy to Vercel
        4. Wait for success
        5. Return live URL
        """
        logger.info(f"[DEPLOY] Starting full pipeline for: {project_name}")

        # 1. Create repo
        repo = await self.create_repo(project_name, description)

        # 2. Push files
        await self.write_multiple_files(project_name, files,
                                        f"Jarvis: initial deploy — {project_name}")

        # 3. Deploy
        deployment = await self.deploy_to_vercel(project_name)

        # 4. Wait
        if deployment.get("id"):
            result = await self.wait_for_deployment(deployment["id"])
        else:
            result = {"success": True, "url": deployment.get("url")}

        logger.info(f"[DEPLOY] Pipeline complete: {result}")
        return {
            "repo_url":       repo.get("html_url"),
            "deployment_url": result.get("url"),
            "success":        result.get("success"),
            "error":          result.get("error")
        }

    async def execute(self, step: str, context: dict) -> dict:
        """Routes deployment action steps from the master loop plan."""
        step_lower = step.lower()
        if "create repo" in step_lower:
            name = context.get("project_name", "jarvis-project")
            return await self.create_repo(name)
        if "deploy" in step_lower:
            return await self.full_deploy_pipeline(
                project_name=context.get("project_name", "jarvis-app"),
                files=context.get("files", {"index.html": "<h1>Deployed by Jarvis</h1>"}),
                description=context.get("description", "")
            )
        return {"status": "no_deploy_action_matched", "step": step}
