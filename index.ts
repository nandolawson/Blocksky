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

async function getDidFromList(did: string, list: string): Promise<string[]> {
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
                    if (item.subject && item.subject.did) {
                        members.push(item.subject.did);
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

async function pushArray(array: string[], did: string, list: string): Promise<string[]> {
    const addedDids = [];
    for (const addToList of array) {
        if (counter >= 800) {
            console.log("Max counter reached, stopping execution.");
            process.exit(0);
        }
        try {
            await agent.com.atproto.repo.createRecord({
                collection: "app.bsky.graph.listitem",
                repo: did,
                record: {
                    $type: 'app.bsky.graph.listitem',
                    list: `at://${did}/app.bsky.graph.list/${list}`,
                    subject: addToList,
                    createdAt: new Date().toISOString(),
                },
            });
            console.log(`Added user ${addToList} to list`);
            addedDids.push(addToList);
            counter++;
        } catch (error) {
            console.error(`Error while adding user ${addToList}:`, error);
        }
    }
    return addedDids;
}

async function main() {
    const lists: { did: string; list: string }[] = JSON.parse(fs.readFileSync('lists.json', 'utf-8'));
    const identifier = process.env['IDENTIFIER'];
    const password = process.env['PASSWORD'];
    const blocksky_list = process.env['LIST'];
    if (!identifier || !password || !blocksky_list) {
        throw new Error("Secrets are not correctly set");
    }
    await login(identifier, password);
    console.info("Get entries from Blocksky")
    console.time("Done")
    const blocksky = await getDidFromList(
        await getDidFromHandle(identifier),
        blocksky_list
    );
    console.timeEnd("Done")
    for (const entry of lists) {
        const { did, list } = entry;
        console.info(`Crawling through list ${list}...`)
        console.time("Done");
        const original = await getDidFromList(
            did,
            list
        );
        console.timeEnd("Done");
        console.info("Add possible entries to Blocksky");
        blocksky.push(...
            await pushArray(
                original.filter(item => !blocksky.includes(item)),
                await getDidFromHandle(identifier),
                blocksky_list
            )
        );
        console.info("Done");
    }
}

let counter = 0;
main();