import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, useSession } from '../../state/session';
import { useLoad } from '../../state/useLoad';
import { useToast } from '../../state/toast';
import { Icon } from '../../components/Icon';
import { config } from '../../config';
import type { CommunityGroup, GroupContent, GroupPost } from '../../types';

const ROLE = { peer: 'Community member', moderator: 'Group moderator', expert: 'Verified contributor' };

function Author({ content }: { content: GroupContent }) {
  return <div className="group-author"><span className="group-avatar" aria-hidden="true">{content.authorName.charAt(0).toUpperCase()}</span><div><strong>{content.authorName}</strong><span className="faint">{content.example ? 'Example content' : ROLE[content.authorRole]} · {new Date(content.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span></div>{content.status === 'hidden' && <span className="badge badge--assumed">Needs review</span>}</div>;
}

function Thread({ group, post, moderator, onBack }: { group: CommunityGroup; post: GroupPost; moderator: boolean; onBack: () => void }) {
  const api = useApi().community.groups;
  const toast = useToast();
  const replies = useLoad(() => api.replies(group.id, post.id, moderator), [api, group.id, post.id, moderator]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(run: () => Promise<void>, message: string) {
    setError('');
    try { await run(); toast(message); void replies.reload(); }
    catch (failure) { setError((failure as Error).message); }
  }
  return <section className="home-section group-thread">
    <button className="link-btn" onClick={onBack}><Icon name="back" />Back to group</button>
    <article className="glass group-post"><Author content={post} /><span className="badge badge--quiet">{post.kind}</span><h2 className="subtitle">{post.title}</h2><p className="group-post__text">{post.text}</p>
      <div className="group-content-actions">{post.own || moderator ? <button className="link-btn" onClick={() => void action(async () => { await api.deletePost(group.id, post.id); onBack(); }, 'Post removed')}>Delete post</button> : <><button className="link-btn" onClick={() => void action(() => api.report(group.id, post.id), 'Reported for moderator review')}>Report post</button><button className="link-btn" onClick={() => void action(async () => { await api.block(group.id, post.id); onBack(); }, 'Member hidden from your community view')}>Block member</button></>}
        {moderator && <button className="link-btn" onClick={() => void action(async () => { await api.review(group.id, post.id, post.status === 'hidden' ? 'published' : 'hidden'); onBack(); }, 'Moderation saved')}>{post.status === 'hidden' ? 'Restore post' : 'Hide post'}</button>}
      </div>
    </article>
    <h3 className="subtitle">Replies</h3>
    {replies.loading && !replies.data && <p role="status" className="faint">Loading replies...</p>}
    {replies.error && <p className="callout" role="alert">{replies.error.message}</p>}
    <div className="group-replies">{replies.data?.map((reply) => <article className="group-reply" key={reply.id}><Author content={reply} /><p className="group-post__text">{reply.text}</p><div className="group-content-actions">{reply.own || moderator ? <button className="link-btn" onClick={() => void action(() => api.deleteReply(group.id, post.id, reply.id), 'Reply removed')}>Delete reply</button> : <><button className="link-btn" onClick={() => void action(() => api.report(group.id, post.id, reply.id), 'Reply reported for review')}>Report reply</button><button className="link-btn" onClick={() => void action(() => api.block(group.id, post.id, reply.id), 'Member hidden from your community view')}>Block member</button></>}{moderator && <button className="link-btn" onClick={() => void action(() => api.review(group.id, post.id, reply.status === 'hidden' ? 'published' : 'hidden', reply.id), 'Moderation saved')}>{reply.status === 'hidden' ? 'Restore reply' : 'Hide reply'}</button>}</div></article>)}</div>
    {!replies.loading && !replies.data?.length && <p className="faint">No replies yet. A thoughtful first response can help.</p>}
    {post.status === 'published' && <form className="stack group-composer" onSubmit={async (event) => { event.preventDefault(); if (busy || !text.trim()) return; setBusy(true); setError(''); try { await api.reply(group.id, post.id, text); setText(''); void replies.reload(); toast('Reply posted'); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>
      <label className="field"><span className="field__label">Your reply</span><textarea className="textarea" rows={3} maxLength={2000} required value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="Share an experience or a kind, practical thought." /></label>
      <button className="btn" disabled={busy || !text.trim()}><Icon name="share" />{busy ? 'Posting...' : 'Post reply'}</button>
    </form>}
    {error && <p className="callout" role="alert">{error}</p>}
  </section>;
}

function GroupFeed({ group, moderator, onLeave }: { group: CommunityGroup; moderator: boolean; onLeave: () => Promise<void> }) {
  const api = useApi().community.groups;
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [moderation, setModeration] = useState(false);
  const feed = useLoad(() => api.posts(group.id, page, moderation), [api, group.id, page, moderation]);
  const [thread, setThread] = useState<GroupPost | null>(null);
  const [kind, setKind] = useState<GroupPost['kind']>('question');
  const [title, setTitle] = useState(''); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { window.scrollTo(0, 0); }, [thread?.id]);
  if (thread) return <Thread group={group} post={thread} moderator={moderator} onBack={() => { setThread(null); void feed.reload(); }} />;
  return <>
    <div className="group-membership"><span className="badge badge--ok"><Icon name="check" />Joined</span><span className="faint">{group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}</span><button className="link-btn" disabled={busy} onClick={async () => { setBusy(true); try { await onLeave(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>Leave group</button></div>
    <p className="faint">Share experiences, not diagnoses or medication advice. Keep names and contact details private. Your posts remain if you leave; delete your own content first if needed.</p>
    {!moderation && <form className="glass stack group-composer" onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await api.post(group.id, { kind, title, text }); setTitle(''); setText(''); toast('Posted to the group'); if (page === 0) void feed.reload(); else setPage(0); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>
      <h3 className="subtitle">Share with this group</h3><label className="field"><span className="field__label">Post type</span><select className="select" value={kind} onChange={(event) => setKind(event.target.value as GroupPost['kind'])}><option value="question">Question</option><option value="experience">Experience</option><option value="challenge">Challenge</option></select></label>
      <label className="field"><span className="field__label">Post title</span><input className="input" required maxLength={120} value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span className="field__label">Your post</span><textarea className="textarea" required rows={4} maxLength={2000} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
      <button className="btn" disabled={busy || !title.trim() || !text.trim()}><Icon name="plus" />{busy ? 'Posting...' : 'Post to group'}</button>
    </form>}
    <div className="row row--between"><h3 className="subtitle">{moderation ? 'Moderator review' : 'Group conversations'}</h3>{moderator && <button className="link-btn" onClick={() => { setModeration(!moderation); setPage(0); }}>{moderation ? 'Back to conversations' : 'Review reported content'}</button>}</div>
    {feed.loading && !feed.data && <p className="faint" role="status">Loading conversations...</p>}
    {feed.error && <p className="callout" role="alert">{feed.error.message}</p>}
    <div className="group-feed">{feed.data?.posts.map((post) => <article className="glass group-post" key={post.id}><Author content={post} /><span className="badge badge--quiet">{post.kind}</span><h3 className="subtitle">{post.title}</h3><p className="group-post__text">{post.text}</p><button className="group-thread-button link-btn" onClick={() => setThread(post)}><Icon name="person" />{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'} · Open conversation</button></article>)}</div>
    {feed.data && !feed.data.posts.length && <p className="empty">{moderation ? 'No content awaiting review.' : 'No posts yet. You can start the conversation.'}</p>}
    <nav className="pagination" aria-label="Community pages"><button className="btn btn--small btn--soft" disabled={page === 0 || feed.loading} onClick={() => setPage(page - 1)}>Previous</button><span className="faint">Page {page + 1}</span><button className="btn btn--small btn--soft" disabled={!feed.data?.hasMore || feed.loading} onClick={() => setPage(page + 1)}>Next</button></nav>
    {error && <p className="callout" role="alert">{error}</p>}
  </>;
}

export function GroupCommunity() {
  const api = useApi().community.groups;
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const groups = useLoad(() => api.list(), [api]);
  const selected = groups.data?.find((group) => group.id === params.get('group'));
  const [displayName, setDisplayName] = useState(session?.displayName?.split(' ')[0] ?? 'Parent');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const moderator = session?.role === 'moderator';
  useEffect(() => { window.scrollTo(0, 0); }, [params.get('group')]);
  return <>
    <div className="page-heading"><span className="eyebrow">PARENTS, TOGETHER</span><h1 className="title">Community</h1><p className="muted">Find a group, join in, and share the everyday questions and little wins.</p></div>
    {config.apiMode === 'mock' && <p className="faint">Test communities stay in this browser and contain labelled examples. Real signed-in accounts connect with other members.</p>}
    {groups.error && <p className="callout" role="alert">{groups.error.message}</p>}
    {groups.loading && !groups.data && <p role="status" className="faint">Loading groups...</p>}
    {!selected ? <div className="community-group-grid">{groups.data?.map((group) => <article className="glass community-group-card" key={group.id}><span className="tile__icon"><Icon name={group.icon} /></span><h2 className="subtitle">{group.name}</h2><p className="muted">{group.description}</p><span className="faint">{group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}{group.joined ? ' · Joined' : ''}</span><button className="btn btn--soft" onClick={() => setParams({ group: group.id })}>{group.joined ? 'Open group' : 'View group'}: {group.name}</button></article>)}</div> : <section className="home-section">
      <button className="link-btn group-back" onClick={() => setParams({})}><Icon name="back" />All groups</button><div className="page-heading"><h2 className="title">{selected.name}</h2><p className="muted">{selected.description}</p></div>
      {selected.joined ? <GroupFeed key={selected.id} group={selected} moderator={moderator} onLeave={async () => { await api.leave(selected.id); await groups.reload(); }} /> : <form className="glass stack group-join" onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await api.join(selected.id, displayName); await groups.reload(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}>
        <h3 className="subtitle">Join the conversation</h3><p className="muted">Members can read the group, ask questions, post experiences or challenges, and reply to each other.</p><label className="field"><span className="field__label">Name in this group</span><input className="input" required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><p className="faint">This name appears on your posts. Your baby logs and journal are never shared with the group.</p><button className="btn" disabled={busy || !displayName.trim()}>{busy ? 'Joining...' : `Join ${selected.name}`}</button>
      </form>}
    </section>}
    {error && <p className="callout" role="alert">{error}</p>}
  </>;
}