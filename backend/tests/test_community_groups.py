from crysense.store import get_store
from .conftest import ARJUN, MEERA, STRANGER

GROUP = "/v1/community/groups/new-mothers"


def join(baby, headers, name="Parent"):
    return baby.post(f"{GROUP}/membership", headers=headers, json={"displayName": name})


def post(baby, headers, title="A small question"):
    return baby.post(f"{GROUP}/posts", headers=headers, json={"kind": "question", "title": title, "text": "What everyday help did you ask for today?"})


def test_groups_require_signin_and_membership(baby):
    assert baby.get("/v1/community/groups").status_code == 401
    groups = baby.get("/v1/community/groups", headers=MEERA).json()
    assert groups and all(not group["joined"] for group in groups)
    assert baby.get(f"{GROUP}/posts", headers=MEERA).status_code == 403
    assert post(baby, MEERA).status_code == 403
    assert join(baby, MEERA, "Community Meera").status_code == 200
    assert join(baby, MEERA, "Community Meera").status_code == 200
    assert baby.get("/v1/community/groups", headers=MEERA).json()[0]["memberCount"] == 1
    assert baby.delete(f"{GROUP}/membership", headers=MEERA).status_code == 204
    assert baby.get(f"{GROUP}/posts", headers=MEERA).status_code == 403


def test_members_can_post_and_reply_without_private_account_ids(baby):
    join(baby, MEERA, "Meera in the group")
    join(baby, ARJUN, "Another parent")
    created = post(baby, MEERA)
    assert created.status_code == 201
    content = created.json()
    assert content["own"] is True and content["authorRole"] == "peer"
    assert "authorUid" not in content and "motherId" not in content
    reply = baby.post(f"{GROUP}/posts/{content['id']}/replies", headers=ARJUN, json={"text": "A friend helped with lunch."})
    assert reply.status_code == 201
    assert reply.json()["authorName"] == "Another parent"
    viewed = baby.get(f"{GROUP}/posts", headers=ARJUN).json()
    assert viewed["posts"][0]["own"] is False
    assert viewed["posts"][0]["replyCount"] == 1
    assert "authorUid" not in baby.get(f"{GROUP}/posts/{content['id']}/replies", headers=MEERA).json()[0]


def test_only_author_or_moderator_can_delete_content(baby):
    join(baby, MEERA)
    join(baby, ARJUN)
    created = post(baby, MEERA).json()
    reply = baby.post(f"{GROUP}/posts/{created['id']}/replies", headers=ARJUN, json={"text": "A small reply"}).json()
    assert baby.delete(f"{GROUP}/posts/{created['id']}", headers=ARJUN).status_code == 403
    assert baby.delete(f"{GROUP}/posts/{created['id']}/replies/{reply['id']}", headers=MEERA).status_code == 403
    assert baby.delete(f"{GROUP}/posts/{created['id']}/replies/{reply['id']}", headers=ARJUN).status_code == 204
    assert baby.delete(f"{GROUP}/posts/{created['id']}", headers=MEERA).status_code == 204


def test_reports_hide_content_and_moderator_can_review(baby):
    for headers in (MEERA, ARJUN, STRANGER):
        join(baby, headers)
    content = post(baby, MEERA).json()
    path = f"{GROUP}/posts/{content['id']}"
    for headers in (MEERA, ARJUN, STRANGER):
        assert baby.post(f"{path}/report", headers=headers, json={}).status_code == 200
    assert baby.get(f"{GROUP}/posts", headers=ARJUN).json()["posts"] == []
    assert baby.get(f"{GROUP}/posts?moderation=true", headers=ARJUN).status_code == 403
    moderator = {"Authorization": "Bearer mock-group_moderator"}
    get_store().set("users/group_moderator", {"role": "moderator"})
    join(baby, moderator, "Moderator")
    queue = baby.get(f"{GROUP}/posts?moderation=true", headers=moderator).json()["posts"]
    assert len(queue) == 1 and queue[0]["status"] == "hidden"
    assert baby.put(f"{path}/moderation", headers=moderator, json={"status": "published"}).status_code == 200
    assert len(baby.get(f"{GROUP}/posts", headers=ARJUN).json()["posts"]) == 1


def test_blocked_members_are_hidden_from_feed_and_threads(baby):
    join(baby, MEERA)
    join(baby, ARJUN)
    content = post(baby, ARJUN).json()
    assert baby.post(f"{GROUP}/posts/{content['id']}/block", headers=MEERA, json={}).status_code == 200
    assert baby.get(f"{GROUP}/posts", headers=MEERA).json()["posts"] == []
    assert baby.get(f"{GROUP}/posts/{content['id']}/replies", headers=MEERA).status_code == 404


def test_feed_is_paginated_and_alias_cannot_spoof_role(baby):
    join(baby, MEERA)
    for index in range(11):
        assert post(baby, MEERA, f"Question {index}").status_code == 201
    first = baby.get(f"{GROUP}/posts", headers=MEERA).json()
    second = baby.get(f"{GROUP}/posts?page=1", headers=MEERA).json()
    assert len(first["posts"]) == 10 and first["hasMore"] is True
    assert len(second["posts"]) == 1 and second["hasMore"] is False
    assert all(item["authorRole"] == "peer" for item in first["posts"])


def test_reported_reply_surfaces_parent_in_moderation_and_can_be_blocked(baby):
    for headers in (MEERA, ARJUN, STRANGER):
        join(baby, headers)
    content = post(baby, ARJUN).json()
    path = f"{GROUP}/posts/{content['id']}"
    reply = baby.post(f"{path}/replies", headers=MEERA, json={"text": "A peer reply"}).json()
    for headers in (MEERA, ARJUN, STRANGER):
        baby.post(f"{path}/report", headers=headers, json={"replyId": reply["id"]})
    moderator = {"Authorization": "Bearer mock-group_moderator"}
    get_store().set("users/group_moderator", {"role": "moderator"})
    join(baby, moderator, "Moderator")
    queue = baby.get(f"{GROUP}/posts?moderation=true", headers=moderator).json()["posts"]
    assert queue[0]["id"] == content["id"]
    assert baby.get(f"{path}/replies", headers=ARJUN).json() == []
    assert baby.put(f"{path}/moderation", headers=moderator, json={"status": "published", "replyId": reply["id"]}).status_code == 200
    assert baby.post(f"{path}/block", headers=ARJUN, json={"replyId": reply["id"]}).status_code == 200
    assert baby.get(f"{path}/replies", headers=ARJUN).json() == []