import test from 'node:test';
import assert from 'node:assert/strict';
import {discordIdentity, lookupDiscord} from '../worker/discord-api.mjs';

const identity = {userId: '123456789012345678', username: 'fictional.user'};

test('search mode validation preserves default behavior and rejects invalid combinations', () => {
    assert.deepEqual(discordIdentity(identity), identity);
    for (const searchBy of ['both', 'username', 'id'])
        assert.equal(discordIdentity({...identity, searchBy}).searchBy, searchBy);
    for (const searchBy of ['', null, false, 'other'])
        assert.throws(() => discordIdentity({...identity, searchBy}));
    assert.throws(() => discordIdentity({...identity, searchBy: 'id', connectedUsernames: ['linked.user']}));
});

test('single-identifier modes query only the selected identifier across every provider', async () => {
    for (const searchBy of ['username', 'id', 'both']) {
        for (const configured of [false, true]) {
            const tasks = [];
            const result = await lookupDiscord(discordIdentity({...identity, searchBy}), configured ? {OATHNET_API_KEY: 'fixture'} : {}, new AbortController().signal, async task => {
                tasks.push(task);
                return {items: []};
            });
            assert.equal(result.searchBy, searchBy);
            const expected = searchBy === 'both' ? ['id', 'username'] : [searchBy];
            assert.deepEqual(tasks.filter(task => !task.provider && task.kind !== 'profile').map(task => task.kind), expected);
            assert.equal(tasks.filter(task => task.kind === 'profile').length, configured && searchBy !== 'username' ? 1 : 0);
            for (const task of tasks.filter(task => task.kind !== 'profile')) {
                assert.ok(expected.includes(task.kind));
                assert.equal(task.query, task.kind === 'id' ? identity.userId : identity.username);
            }
            if (configured) for (const family of ['breach', 'stealer', 'victims'])
                assert.deepEqual(tasks.filter(task => task.family === family).map(task => task.kind), expected);
        }
    }
});

test('username-only supports linked names without adding ID or profile lookups', async () => {
    const tasks = [];
    await lookupDiscord(discordIdentity({...identity, searchBy: 'username', connectedUsernames: ['linked.user']}), {OATHNET_API_KEY: 'fixture'}, new AbortController().signal, async task => {
        tasks.push(task);
        return {items: []};
    });
    assert.ok(tasks.every(task => ['username', 'connected'].includes(task.kind)));
    assert.equal(tasks.filter(task => task.query === 'linked.user').length, 4);
});
