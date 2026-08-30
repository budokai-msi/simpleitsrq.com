import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Connect to IMAP and fetch unread emails.
 * Returns array of parsed replies.
 */
export async function fetchImapReplies({ host, port, user, pass, secure = true }) {
  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: secure,
    auth: { user, pass },
    logger: false,
  });

  const replies = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const search = { seen: false };
      for await (const message of client.fetch(search, { source: true, envelope: true })) {
        if (!message.source) continue;
        
        const parsed = await simpleParser(message.source);
        let refs = [];
        if (Array.isArray(parsed.references)) {
          refs = parsed.references;
        } else if (typeof parsed.references === 'string') {
          refs = parsed.references.split(/\s+/).filter(Boolean);
        }
        
        const isWarmup = parsed.headers.has('x-simpleitsrq-warmup');

        replies.push({
          uid: message.uid,
          messageId: parsed.messageId || "",
          inReplyTo: parsed.inReplyTo || "",
          references: refs,
          from: parsed.from?.text || parsed.from?.value?.[0]?.address || "",
          subject: parsed.subject || "",
          bodyText: parsed.text || "",
          date: parsed.date,
          isWarmup
        });
      }
    } finally {
      lock.release();
    }
    
    await client.logout();
    return replies;
  } catch (err) {
    console.error("[imap] fetch error", err);
    throw err;
  }
}

/**
 * Mark specified UIDs as seen (read)
 */
export async function markImapSeen({ host, port, user, pass, secure = true }, uids) {
  if (!uids || uids.length === 0) return;
  
  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: secure,
    auth: { user, pass },
    logger: false,
  });
  
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.messageFlagsAdd(uids, ['\\Seen']);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error("[imap] mark seen error", err);
  }
}
