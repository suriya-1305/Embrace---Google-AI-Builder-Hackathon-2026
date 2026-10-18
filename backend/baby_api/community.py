from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from crysense.api_common import audit, new_id
from crysense.auth import Principal, get_principal
from crysense.safety.engine import load_json
from crysense.store import get_store

router = APIRouter(prefix="/v1/community/groups", tags=["community-groups"])


class JoinIn(BaseModel):
    displayName: str = Field(min_length=1, max_length=40)


class PostIn(BaseModel):
    kind: Literal["question", "experience", "challenge"] = "question"
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=2000)


class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ReviewIn(BaseModel):
    status: Literal["published", "hidden"]
    replyId: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,80}$")


class ReportIn(BaseModel):
    replyId: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,80}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _group(group_id: str) -> dict:
    group = next((item for item in load_json("content/community_groups_v1.json")["groups"] if item["id"] == group_id), None)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return group


def _membership(group_id: str, uid: str) -> str:
    return f"communityMemberships/{group_id}_{uid}"


def _member(group_id: str, principal: Principal) -> dict:
    _group(group_id)
    member = get_store().get(_membership(group_id, principal.uid))
    if member is None:
        raise HTTPException(status_code=403, detail="Join this group before reading or posting.")
    return member


def _moderator(principal: Principal) -> bool:
    return (get_store().get(f"users/{principal.uid}") or {}).get("role") == "moderator"


def _post_path(group_id: str, post_id: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", post_id):
        raise HTTPException(status_code=404, detail="Post not found.")
    return f"communityGroups/{group_id}/posts/{post_id}"


def _post(group_id: str, post_id: str, principal: Principal) -> dict:
    _member(group_id, principal)
    post = get_store().get(_post_path(group_id, post_id))
    if post is None or post.get("authorUid") in _blocked(principal) or (post.get("status") != "published" and post.get("authorUid") != principal.uid and not _moderator(principal)):
        raise HTTPException(status_code=404, detail="Post not found.")
    return post


def _blocked(principal: Principal) -> set[str]:
    return {row["blockedUid"] for row in get_store().list(f"communityBlocks/{principal.uid}/members")}


def _public_content(content: dict, principal: Principal) -> dict:
    fields = ("id", "title", "text", "kind", "authorName", "authorRole", "createdAt", "status", "groupId")
    return {**{key: content[key] for key in fields if key in content}, "own": content.get("authorUid") == principal.uid}


def _author(member: dict, principal: Principal) -> dict:
    user = get_store().get(f"users/{principal.uid}") or {}
    role = "expert" if user.get("role") == "moderator" and user.get("expertVerified") is True else "moderator" if user.get("role") == "moderator" else "peer"
    return {"authorUid": principal.uid, "authorName": member["displayName"], "authorRole": role}


@router.get("")
def list_groups(principal: Principal = Depends(get_principal)) -> list[dict]:
    memberships = get_store().list("communityMemberships")
    return [{**group, "joined": any(row.get("uid") == principal.uid and row.get("groupId") == group["id"] for row in memberships),
             "memberCount": sum(row.get("groupId") == group["id"] for row in memberships)}
            for group in load_json("content/community_groups_v1.json")["groups"]]


@router.post("/{group_id}/membership")
def join_group(group_id: str, body: JoinIn, principal: Principal = Depends(get_principal)) -> dict:
    _group(group_id)
    name = body.displayName.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Choose a name to use in this group.")
    path = _membership(group_id, principal.uid)
    previous = get_store().get(path) or {}
    get_store().set(path, {"uid": principal.uid, "groupId": group_id, "displayName": name, "joinedAt": previous.get("joinedAt", _now())})
    return {"joined": True}


@router.delete("/{group_id}/membership", status_code=204, response_class=Response)
def leave_group(group_id: str, principal: Principal = Depends(get_principal)):
    _group(group_id)
    get_store().delete(_membership(group_id, principal.uid))


@router.get("/{group_id}/posts")
def list_posts(group_id: str, page: int = Query(0, ge=0, le=1000), moderation: bool = False, principal: Principal = Depends(get_principal)) -> dict:
    _member(group_id, principal)
    if moderation and not _moderator(principal):
        raise HTTPException(status_code=403, detail="Moderator access is required.")
    blocked = _blocked(principal)
    rows = []
    for row in get_store().list(f"communityGroups/{group_id}/posts"):
        reported_reply = moderation and any(reply.get("status") == "hidden" for reply in get_store().list(f"{_post_path(group_id, row['id'])}/replies"))
        visible = row.get("status") == "hidden" or reported_reply if moderation else row.get("status") == "published"
        if visible and row.get("authorUid") not in blocked:
            rows.append(row)
    rows.sort(key=lambda row: row["createdAt"], reverse=True)
    selected = rows[page * 10:(page + 1) * 10]
    posts = [{**_public_content(row, principal), "replyCount": sum(reply.get("status") == "published" for reply in get_store().list(f"{_post_path(group_id, row['id'])}/replies"))} for row in selected]
    return {"posts": posts, "hasMore": len(rows) > (page + 1) * 10, "page": page}


@router.post("/{group_id}/posts", status_code=201)
def create_post(group_id: str, body: PostIn, principal: Principal = Depends(get_principal)) -> dict:
    member = _member(group_id, principal)
    if not body.title.strip() or not body.text.strip():
        raise HTTPException(status_code=422, detail="Add a title and something to share.")
    post_id = new_id("post")
    content = {"id": post_id, "groupId": group_id, "title": body.title.strip(), "text": body.text.strip(),
               "kind": body.kind, "createdAt": _now(), "status": "published", **_author(member, principal)}
    get_store().set(_post_path(group_id, post_id), content)
    return {**_public_content(content, principal), "replyCount": 0}


@router.get("/{group_id}/posts/{post_id}/replies")
def list_replies(group_id: str, post_id: str, moderation: bool = False, principal: Principal = Depends(get_principal)) -> list[dict]:
    _post(group_id, post_id, principal)
    if moderation and not _moderator(principal):
        raise HTTPException(status_code=403, detail="Moderator access is required.")
    blocked = _blocked(principal)
    rows = [row for row in get_store().list(f"{_post_path(group_id, post_id)}/replies") if row.get("authorUid") not in blocked and (moderation or row.get("status") == "published")]
    rows.sort(key=lambda row: row["createdAt"])
    return [_public_content(row, principal) for row in rows]


@router.post("/{group_id}/posts/{post_id}/replies", status_code=201)
def create_reply(group_id: str, post_id: str, body: ReplyIn, principal: Principal = Depends(get_principal)) -> dict:
    post = _post(group_id, post_id, principal)
    if post.get("status") != "published" or not body.text.strip():
        raise HTTPException(status_code=422, detail="This conversation is not open for replies.")
    member = _member(group_id, principal)
    content = {"id": new_id("reply"), "text": body.text.strip(), "status": "published", "createdAt": _now(), **_author(member, principal)}
    get_store().set(f"{_post_path(group_id, post_id)}/replies/{content['id']}", content)
    return _public_content(content, principal)


@router.delete("/{group_id}/posts/{post_id}", status_code=204, response_class=Response)
def delete_post(group_id: str, post_id: str, principal: Principal = Depends(get_principal)):
    post = _post(group_id, post_id, principal)
    if post.get("authorUid") != principal.uid and not _moderator(principal):
        raise HTTPException(status_code=403, detail="You can remove only your own posts.")
    get_store().delete(_post_path(group_id, post_id))


@router.delete("/{group_id}/posts/{post_id}/replies/{reply_id}", status_code=204, response_class=Response)
def delete_reply(group_id: str, post_id: str, reply_id: str, principal: Principal = Depends(get_principal)):
    _post(group_id, post_id, principal)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", reply_id):
        raise HTTPException(status_code=404, detail="Reply not found.")
    path = f"{_post_path(group_id, post_id)}/replies/{reply_id}"
    reply = get_store().get(path)
    if reply is None:
        raise HTTPException(status_code=404, detail="Reply not found.")
    if reply.get("authorUid") != principal.uid and not _moderator(principal):
        raise HTTPException(status_code=403, detail="You can remove only your own replies.")
    get_store().delete(path)


@router.post("/{group_id}/posts/{post_id}/report")
def report_content(group_id: str, post_id: str, body: ReportIn, principal: Principal = Depends(get_principal)) -> dict:
    _post(group_id, post_id, principal)
    path = _post_path(group_id, post_id) + (f"/replies/{body.replyId}" if body.replyId else "")
    content = get_store().get(path)
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found.")
    get_store().set(f"{path}/reports/{principal.uid}", {"reportedAt": _now()})
    if len(get_store().list(f"{path}/reports")) >= 3:
        get_store().set(path, {**content, "status": "hidden"})
    audit(principal.uid, "community.content_reported", post_id, {}, datetime.now(timezone.utc))
    return {"reported": True}


@router.post("/{group_id}/posts/{post_id}/block")
def block_member(group_id: str, post_id: str, body: ReportIn, principal: Principal = Depends(get_principal)) -> dict:
    post = _post(group_id, post_id, principal)
    content = get_store().get(f"{_post_path(group_id, post_id)}/replies/{body.replyId}") if body.replyId else post
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found.")
    if content.get("authorUid") == principal.uid:
        raise HTTPException(status_code=422, detail="This is your own post.")
    get_store().set(f"communityBlocks/{principal.uid}/members/{content['authorUid']}", {"blockedUid": content["authorUid"], "createdAt": _now()})
    return {"blocked": True}


@router.put("/{group_id}/posts/{post_id}/moderation")
def moderate_content(group_id: str, post_id: str, body: ReviewIn, principal: Principal = Depends(get_principal)) -> dict:
    _member(group_id, principal)
    if not _moderator(principal):
        raise HTTPException(status_code=403, detail="Moderator access is required.")
    path = _post_path(group_id, post_id) + (f"/replies/{body.replyId}" if body.replyId else "")
    content = get_store().get(path)
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found.")
    get_store().set(path, {**content, "status": body.status})
    audit(principal.uid, "community.content_reviewed", post_id, {"status": body.status}, datetime.now(timezone.utc))
    return {"reviewed": True}