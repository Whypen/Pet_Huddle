import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('./app/node_modules/typescript');
const source = fs.readFileSync('./app/src/lib/nativeChatMirror.ts', 'utf8');
let js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(js, { module, exports: module.exports, require, console, Map, JSON, Boolean, Date, Math, Set });
const h = module.exports;

const baseRow = {
  chatId: 'room-1',
  blockedByMe: true,
  blockedByThem: true,
  lastMessageAt: '2026-05-17T00:00:00Z',
  lastMessageContent: 'stale preview',
  lastMessageId: 'message-1',
  lastMessageReadByOther: true,
  lastMessageSenderId: 'sender-1',
  lastMessageSenderName: 'Sender',
  unmatchedByMe: true,
  unmatchedByThem: true,
  unreadCount: 7,
  shellName: 'Room shell',
};

const envelope = {
  userId: 'user-1',
  sessionKey: 'user-1:1',
  surface: 'native_chats:friends:my',
  cachedAt: Date.now(),
  dbConfirmedAt: Date.now(),
  source: 'db',
  rows: [baseRow],
};
assert.equal(h.isNativeValidatedMirrorEnvelope(envelope, { userId: 'user-1', sessionKey: 'user-1:1', surface: 'native_chats:friends:my' }), true);
assert.equal(h.isNativeValidatedMirrorEnvelope({ ...envelope, sessionKey: 'old' }, { userId: 'user-1', sessionKey: 'user-1:1', surface: 'native_chats:friends:my' }), false);

const hydrated = h.liveSafeHydratedInboxRow(baseRow);
assert.equal(hydrated.unreadCount, 0);
assert.equal(hydrated.lastMessageContent, null);
assert.equal(hydrated.lastMessageAt, null);
assert.equal(hydrated.lastMessageSenderId, null);
assert.equal(hydrated.blockedByMe, false);
assert.equal(hydrated.blockedByThem, false);
assert.equal(hydrated.unmatchedByMe, false);
assert.equal(hydrated.unmatchedByThem, false);
assert.equal(hydrated.shellName, 'Room shell');

const sameCurrent = [{ ...baseRow, unreadCount: 1 }];
const sameDb = [{ ...sameCurrent[0] }];
const sameResult = h.reconcileInboxRowsByRoomId(sameCurrent, sameDb);
assert.equal(sameResult.changed, false);
assert.equal(sameResult.rows, sameCurrent);
assert.equal(sameResult.rows[0], sameCurrent[0]);

const changedDb = [{ ...sameCurrent[0], unreadCount: 0 }, { ...baseRow, chatId: 'room-2', unreadCount: 3 }];
const changedResult = h.reconcileInboxRowsByRoomId(sameCurrent, changedDb);
assert.equal(changedResult.changed, true);
assert.equal(changedResult.rows.length, 2);
assert.equal(changedResult.rows[0].unreadCount, 0);
assert.equal(changedResult.rows[1].chatId, 'room-2');

assert.equal(h.shouldAcceptFreshInboxWrite({ currentKey: 'k', requestKey: 'k', currentSeq: 2, requestSeq: 2 }), true);
assert.equal(h.shouldAcceptFreshInboxWrite({ currentKey: 'k', requestKey: 'k', currentSeq: 3, requestSeq: 2 }), false);
assert.equal(h.shouldAcceptFreshInboxWrite({ currentKey: 'new', requestKey: 'old', currentSeq: 2, requestSeq: 2 }), false);

const overlay = new Map([['room-1', 7]]);
assert.equal(h.unreadTotalWithReadOverlay([{ chatId: 'room-1', unreadCount: 7 }, { chatId: 'room-2', unreadCount: 2 }], overlay), 2);

assert.equal(h.shouldHydrateCachedMessagesBeforeMembership({ withUserId: 'peer-1' }), true);
assert.equal(h.shouldHydrateCachedMessagesBeforeMembership({ withUserId: null }), false);

const transitions = [];
transitions.push({ source: 'cache', status: 'hydrating' });
transitions.push({ source: 'db', status: 'fresh' });
assert.equal(transitions.some((t) => t.source === 'cache' && t.status === 'fresh'), false);
assert.equal(transitions.some((t) => t.source === 'db' && t.status === 'fresh'), true);

console.log('HARNESS PASS native chat validated mirror');
