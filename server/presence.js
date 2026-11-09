// Single-server presence. Each authenticated account counts once, across tabs.
function getCampusOnlineUserIds(io, campusSlug) {
  const users = new Set();
  if (!campusSlug) return users;
  const connections = io.sockets.adapter.rooms.get('campus:' + campusSlug) || [];
  for (const id of connections) {
    const socket = io.sockets.sockets.get(id);
    if (socket?.connected && socket.user?.id && socket.user.campus?.slug === campusSlug) {
      users.add(socket.user.id);
    }
  }
  return users;
}

function canJoinIdentityRoom(user, room) {
  return Boolean(user?.id && typeof room === 'string' && (
    room === 'user:' + user.id ||
    (user.campus?.slug && room === 'campus:' + user.campus.slug)
  ));
}

module.exports = { getCampusOnlineUserIds, canJoinIdentityRoom };
