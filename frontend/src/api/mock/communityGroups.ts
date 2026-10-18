import content from '@shared/content/community_groups_v1.json';
import { ApiError, type GroupContent, type GroupPost } from '../../types';
import type { CommunityGroupsApi } from '../contract';
import type { Doc } from './seed';

interface Store { get(path: string): Doc | null; set(path: string, value: Doc): Doc; list(path: string): Doc[]; del(path: string): void }

export function createDemoCommunityGroups(uid: string, store: Store): CommunityGroupsApi {
  const now = () => new Date().toISOString();
  const postPath = (groupId: string, postId: string) => `communityGroups/${groupId}/posts/${postId}`;
  const memberPath = (groupId: string) => `communityMemberships/${groupId}_${uid}`;
  const isModerator = () => store.get(`users/${uid}`)?.role === 'moderator';
  const group = (groupId: string) => { const value = content.groups.find((item) => item.id === groupId); if (!value) throw new ApiError(404, 'Group not found.'); return value; };
  const member = (groupId: string) => { group(groupId); const value = store.get(memberPath(groupId)); if (!value) throw new ApiError(403, 'Join this group before reading or posting.'); return value; };
  const blocked = () => new Set(store.list(`communityBlocks/${uid}/members`).map((item) => item.blockedUid));
  const getPost = (groupId: string, postId: string) => { member(groupId); const value = store.get(postPath(groupId, postId)); if (!value || blocked().has(value.authorUid) || value.status !== 'published' && value.authorUid !== uid && !isModerator()) throw new ApiError(404, 'Post not found.'); return value; };
  const publicContent = (value: Doc) => {
    const { authorUid, ...visible } = value;
    return { ...visible, own: authorUid === uid } as unknown as GroupContent;
  };
  const author = (groupId: string) => ({ authorUid: uid, authorName: member(groupId).displayName, authorRole: isModerator() ? store.get(`users/${uid}`)?.expertVerified ? 'expert' : 'moderator' : 'peer' });

  for (const example of content.examples) {
    const path = postPath(example.groupId, example.id);
    if (!store.get(path)) {
      store.set(path, { id: example.id, groupId: example.groupId, title: example.title, text: example.text, kind: example.kind, authorName: example.authorName, authorUid: 'example-parent', authorRole: 'peer', status: 'published', example: true, createdAt: now() });
      store.set(`${path}/replies/example-reply`, { text: example.reply, authorName: 'Another example parent', authorUid: 'example-replier', authorRole: 'peer', status: 'published', example: true, createdAt: now() });
    }
  }

  return {
    async list() {
      const memberships = store.list('communityMemberships');
      return content.groups.map((item) => ({ ...item, joined: !!store.get(memberPath(item.id)), memberCount: memberships.filter((row) => row.groupId === item.id).length }));
    },
    async join(groupId, displayName) { group(groupId); if (!displayName.trim() || displayName.length > 40) throw new ApiError(422, 'Choose a name to use in this group.'); store.set(memberPath(groupId), { uid, groupId, displayName: displayName.trim(), joinedAt: now() }); },
    async leave(groupId) { group(groupId); store.del(memberPath(groupId)); },
    async posts(groupId, page = 0, moderation = false) {
      member(groupId); if (moderation && !isModerator()) throw new ApiError(403, 'Moderator access is required.');
      const hiddenMembers = blocked();
      const rows = store.list(`communityGroups/${groupId}/posts`).filter((item) => (moderation ? item.status === 'hidden' || store.list(`${postPath(groupId, item.id)}/replies`).some((reply) => reply.status === 'hidden') : item.status === 'published') && !hiddenMembers.has(item.authorUid)).sort((first, second) => second.createdAt.localeCompare(first.createdAt));
      return { posts: rows.slice(page * 10, (page + 1) * 10).map((item) => ({ ...publicContent(item), replyCount: store.list(`${postPath(groupId, item.id)}/replies`).filter((reply) => reply.status === 'published').length } as GroupPost)), hasMore: rows.length > (page + 1) * 10, page };
    },
    async post(groupId, input) {
      member(groupId); if (!input.title.trim() || !input.text.trim() || input.title.length > 120 || input.text.length > 2000) throw new ApiError(422, 'Check the post title and text.');
      const id = `post_${crypto.randomUUID()}`;
      const value = store.set(postPath(groupId, id), { ...input, groupId, ...author(groupId), status: 'published', createdAt: now() });
      return { ...publicContent(value), replyCount: 0 } as GroupPost;
    },
    async replies(groupId, postId, moderation = false) {
      getPost(groupId, postId); if (moderation && !isModerator()) throw new ApiError(403, 'Moderator access is required.');
      const hiddenMembers = blocked();
      return store.list(`${postPath(groupId, postId)}/replies`).filter((item) => !hiddenMembers.has(item.authorUid) && (moderation || item.status === 'published')).sort((first, second) => first.createdAt.localeCompare(second.createdAt)).map(publicContent);
    },
    async reply(groupId, postId, text) {
      const post = getPost(groupId, postId); if (post.status !== 'published' || !text.trim() || text.length > 2000) throw new ApiError(422, 'Add a short reply to an open conversation.');
      return publicContent(store.set(`${postPath(groupId, postId)}/replies/reply_${crypto.randomUUID()}`, { text: text.trim(), ...author(groupId), createdAt: now(), status: 'published' }));
    },
    async deletePost(groupId, postId) { const post = getPost(groupId, postId); if (post.authorUid !== uid && !isModerator()) throw new ApiError(403, 'You can remove only your own post.'); store.del(postPath(groupId, postId)); },
    async deleteReply(groupId, postId, replyId) { getPost(groupId, postId); const path = `${postPath(groupId, postId)}/replies/${replyId}`; const reply = store.get(path); if (!reply || reply.authorUid !== uid && !isModerator()) throw new ApiError(403, 'You can remove only your own reply.'); store.del(path); },
    async report(groupId, postId, replyId) { getPost(groupId, postId); const path = postPath(groupId, postId) + (replyId ? `/replies/${replyId}` : ''); const item = store.get(path); if (!item) throw new ApiError(404, 'Content not found.'); store.set(`${path}/reports/${uid}`, { reportedAt: now() }); if (store.list(`${path}/reports`).length >= 3) store.set(path, { ...item, status: 'hidden' }); },
    async block(groupId, postId, replyId) { const post = getPost(groupId, postId); const item = replyId ? store.get(`${postPath(groupId, postId)}/replies/${replyId}`) : post; if (!item) throw new ApiError(404, 'Content not found.'); if (item.authorUid === uid) throw new ApiError(422, 'This is your own content.'); store.set(`communityBlocks/${uid}/members/${item.authorUid}`, { blockedUid: item.authorUid, createdAt: now() }); },
    async review(groupId, postId, status, replyId) { member(groupId); if (!isModerator()) throw new ApiError(403, 'Moderator access is required.'); const path = postPath(groupId, postId) + (replyId ? `/replies/${replyId}` : ''); const item = store.get(path); if (!item) throw new ApiError(404, 'Content not found.'); store.set(path, { ...item, status }); },
  };
}