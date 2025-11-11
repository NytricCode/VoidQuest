// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const TICK_RATE = 20;
const worlds = {};

function makeWorld(name) {
  return { name, players: {}, projectiles: [], createdAt: Date.now() };
}

io.on('connection', (socket) => {
  socket.on('joinWorld', (data) => {
    const { username, world } = data;
    socket.data.username = username || 'Anon';
    socket.data.world = world || 'lobby';
    if (!worlds[world]) worlds[world] = makeWorld(world);
    const w = worlds[world];
    const player = {
      id: socket.id,
      username: socket.data.username,
      x: Math.random() * 600 + 50,
      y: Math.random() * 300 + 50,
      vx: 0, vy: 0,
      hp: 100, maxHp: 100,
      facing: 0,
      lastAbilityTs: {}, skills: { dash: 0, teleport: 0, shield: 0 },
      color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };
    w.players[socket.id] = player;
    socket.join(world);
    socket.emit('joined', { player, worldSnapshot: snapshotWorld(w) });
    socket.to(world).emit('playerJoined', { player });
  });

  socket.on('input', (data) => {
    const world = socket.data.world;
    if (!worlds[world]) return;
    const player = worlds[world].players[socket.id];
    if (!player) return;
    player.vx = data.moveX * 200;
    player.vy = data.moveY * 200;
    if (data.aimX !== undefined && data.aimY !== undefined) {
      player.facing = Math.atan2(data.aimY - player.y, data.aimX - player.x);
    }
    if (data.act) handleAbility(worlds[world], player, data.act, data.actTarget);
  });

  socket.on('disconnect', () => {
    const world = socket.data.world;
    if (worlds[world] && worlds[world].players[socket.id]) {
      delete worlds[world].players[socket.id];
      io.to(world).emit('playerLeft', { id: socket.id });
    }
  });
});

function snapshotWorld(w) {
  return { players: Object.values(w.players).map(p => ({ id: p.id, username: p.username, x: p.x, y: p.y, hp: p.hp, color: p.color })) };
}

function handleAbility(world, player, ability, target) {
  const now = Date.now();
  const cooldowns = { dash: 3000, teleport: 5000, shield: 8000 };
  if (player.lastAbilityTs[ability] && now - player.lastAbilityTs[ability] < cooldowns[ability]) return;
  player.lastAbilityTs[ability] = now;
  if (ability === 'dash') {
    player.vx += Math.cos(player.facing) * 600;
    player.vy += Math.sin(player.facing) * 600;
  } else if (ability === 'teleport') {
    if (target && target.x !== undefined && target.y !== undefined) {
      player.x = target.x; player.y = target.y;
    } else {
      player.x += Math.cos(player.facing) * 200;
      player.y += Math.sin(player.facing) * 200;
    }
  } else if (ability === 'shield') {
    player._shieldUntil = Date.now() + 1500;
  }
}

setInterval(() => {
  for (const wname in worlds) {
    const w = worlds[wname];
    for (const id in w.players) {
      const p = w.players[id];
      p.vx *= 0.95; p.vy *= 0.95;
      p.x += p.vx / TICK_RATE; p.y += p.vy / TICK_RATE;
      p.x = Math.max(0, Math.min(800, p.x));
      p.y = Math.max(0, Math.min(600, p.y));
    }
    io.to(wname).emit('worldSnapshot', snapshotWorld(w));
  }
}, 1000 / TICK_RATE);

server.listen(3000, () => console.log('Server running on port 3000'));
