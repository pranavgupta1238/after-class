const redis = require('./redis');

const ALLOWED_EMOJIS = ['❤️', '🔥', '👍', '😂', '👀', '☕', '❄️', '💯'];
const reactionsMemoryStore = new Map(); // messageId -> Map<emoji, Set<userId>>

function getMemoryReactions(messageId) {
  let map = reactionsMemoryStore.get(messageId);
  if (!map) {
    map = new Map();
    reactionsMemoryStore.set(messageId, map);
  }
  return map;
}

function formatReactions(reactionsMap, currentUserId) {
  const result = [];
  for (const [emoji, userSet] of reactionsMap.entries()) {
    if (userSet && userSet.size > 0) {
      result.push({
        emoji,
        count: userSet.size,
        userReacted: currentUserId ? userSet.has(currentUserId) : false,
        users: Array.from(userSet)
      });
    }
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}

async function toggleReaction(messageId, emoji, userId) {
  if (!messageId || !emoji || !userId) return null;
  if (!ALLOWED_EMOJIS.includes(emoji)) return null;

  const memMap = getMemoryReactions(messageId);
  let userSet = memMap.get(emoji);
  if (!userSet) {
    userSet = new Set();
    memMap.set(emoji, userSet);
  }

  let action = 'added';
  if (userSet.has(userId)) {
    userSet.delete(userId);
    action = 'removed';
    if (userSet.size === 0) {
      memMap.delete(emoji);
    }
  } else {
    userSet.add(userId);
    action = 'added';
  }

  try {
    const serialized = {};
    for (const [em, set] of memMap.entries()) {
      serialized[em] = Array.from(set);
    }
    await redis.setOtp('msg_reactions:' + messageId, serialized);
  } catch (err) {}

  return {
    action,
    emoji,
    userId,
    reactions: formatReactions(memMap, userId)
  };
}

async function getReactions(messageId, currentUserId) {
  if (!messageId) return [];
  const memMap = getMemoryReactions(messageId);
  if (memMap.size > 0) {
    return formatReactions(memMap, currentUserId);
  }

  try {
    const cached = await redis.getOtp('msg_reactions:' + messageId);
    if (cached && typeof cached === 'object') {
      for (const [em, userList] of Object.entries(cached)) {
        if (Array.isArray(userList)) {
          memMap.set(em, new Set(userList));
        }
      }
    }
  } catch (err) {}

  return formatReactions(memMap, currentUserId);
}

async function getBatchReactions(messageIds, currentUserId) {
  const result = {};
  if (!Array.isArray(messageIds) || messageIds.length === 0) return result;

  for (const id of messageIds) {
    result[id] = await getReactions(id, currentUserId);
  }
  return result;
}

module.exports = {
  ALLOWED_EMOJIS,
  toggleReaction,
  getReactions,
  getBatchReactions
};
