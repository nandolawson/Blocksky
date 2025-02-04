import { AtpAgent } from '@atproto/api';
import * as fs from 'fs';

const agent = new AtpAgent({ service: 'https://bsky.social' });

async function getDidFromHandle(handle: string): Promise<string> {
    try {
        const response = (await agent.resolveHandle({ handle: handle })).data.did;
        return response;
    } catch (error) {
        console.error("Error resolving handle:", error);
        throw new Error(`Failed to resolve handle: ${handle}`);
    }
}

async function getHandlesFromList(did: string, list: string): Promise<string[]> {
    let cursor: string | undefined;
    const members: string[] = [];
    try {
        do {
            const res = await agent.app.bsky.graph.getList({
                list: `at://${did}/app.bsky.graph.list/${list}`,
                ...(cursor && { cursor: cursor })
            });
            if (res && res.data) {
                res.data.items.forEach(item => {
                    if (item.subject && item.subject.handle) {
                        members.push(item.subject.handle);
                    }
                });
                cursor = res.data.cursor;
            } else {
                console.log('No data found');
                break;
            }
        } while (cursor);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error(error);
        }
    }
    return members;
}

async function login(identifier: string, password: string): Promise<void> {
    await agent
        .login({
            identifier: `${identifier}`,
            password: `${password}`,
        })
        .then((response) => {
            if (response.success) {
                console.log('Login successful');
            } else {
                console.log('Login failed: No success message received');
            }
        })
        .catch((error) => {
            console.error(error.message);
        });
}

async function pushArray(array: string[], did: string, list: string): Promise<void> {
    for (const addToList of array) {
        try {
            await agent.com.atproto.repo.createRecord({
                collection: "app.bsky.graph.listitem",
                repo: did,
                record: {
                    $type: 'app.bsky.graph.listitem',
                    list: `at://${did}/app.bsky.graph.list/${list}`,
                    subject: `${await getDidFromHandle(addToList)}`,
                    createdAt: new Date().toISOString(),
                },
            });
            console.log(`Added user ${addToList} to list`);
        } catch (error) {
            console.error(`Error while adding user ${addToList}:`, error);
        }
    }
}

async function main() {
    const listsData = fs.readFileSync('lists.json', 'utf-8');
    const lists: { did: string; list: string }[] = JSON.parse(listsData);
    const identifier = process.env['IDENTIFIER'];
    const password = process.env['PASSWORD'];
    const blocksky_list = process.env['LIST'];
    if (!identifier || !password || !blocksky_list) {
        throw new Error("Secrets are not correctly set");
    }
    await login(identifier, password);
    for (const entry of lists) {
        const { did, list } = entry;
        const original = await getHandlesFromList(
            did,
            list
        );
        const blocksky = await getHandlesFromList(
            await getDidFromHandle(identifier),
            blocksky_list
        );
        await pushArray(
            original.filter(item => !blocksky.includes(item)),
            await getDidFromHandle(identifier),
            blocksky_list
        );
    }
}

main();