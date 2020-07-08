import fs from 'fs';
import https from 'https';
import luxon from 'luxon';
import path from 'path';
import process from 'process';
import Twitter from 'twitter-lite';

if (!fs.existsSync('./config')) fs.mkdirSync('./config');

if (!fs.existsSync('./config/config.json')) {
    fs.writeFileSync('./config/config.json', JSON.stringify({
        "auth": {
            "consumer_key": "API key",
            "consumer_secret": "API secret key",
            "access_token_key": "Access token",
            "access_token_secret": "Access token secret"
        },
        "lists": {
            "List ID": {
                "retweets": true
            }
        }
    }, null, '\t'));

    console.log('Please configure the app and try again.');
    process.exit();
}

const config = JSON.parse(fs.readFileSync('./config/config.json'));

const twitter = new Twitter(config.auth);
const lists = Object.entries(config.lists);

if (!fs.existsSync('./config/listInfo.json')) {
    fs.writeFileSync('./config/listInfo.json', JSON.stringify({}));
}
const listInfo = JSON.parse(fs.readFileSync('./config/listInfo.json'));

const listsPromise = Promise.all(lists.map(async ([listId, listOptions]) => {
    try {
        if (!listInfo[listId]) {
            await twitter.get('lists/show', {
                list_id: listId
            }).then(res => {
                listInfo[listId] = {
                    name: res.name
                };
            });
        }

        const statusesConfig = {
            list_id: listId,
            include_rts: listOptions.retweets,
            count: 1000
        };
        if (listInfo[listId].latestTweetId) {
            statusesConfig.since_id = listInfo[listId].latestTweetId;
        }
        const statuses = await twitter.get('lists/statuses', statusesConfig);

        console.debug(`${statuses.length} items in list ${listId}`);

        let latestTweetDate, latestTweetId;

        statuses.forEach(status => {
            const isRetweet = Boolean(status.retweeted_status);
            const tweet = status.retweeted_status || status;

            const tweetDate = luxon.DateTime.fromFormat(tweet.created_at, 'EEE MMM dd HH:mm:ss ZZZ yyyy');
            if (!latestTweetDate || tweetDate > latestTweetDate) {
                latestTweetDate = tweetDate;
                latestTweetId = tweet.id_str;
            }

            if (tweet.extended_entities && tweet.extended_entities.media) {
                tweet.extended_entities.media.forEach((media, index) => {
                    /* TODO: support videos & GIFs */
                    if (media.type === 'photo') {
                        const dir = isRetweet ?
                            `./out/${listInfo[listId].name}/retweets/` :
                            `./out/${listInfo[listId].name}/`;
                        const base = `${tweet.user.screen_name}_${tweetDate.toISODate()}_${tweet.id_str}_${index}`;
                        const ext = path.extname(media.media_url_https);

                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                        if (listOptions.dryRun) {
                            fs.writeFile(dir + base, '', () => { });

                        } else {
                            const stream = fs.createWriteStream(dir + base + ext);
                            https.get(media.media_url_https + ':orig', res => {
                                res.pipe(stream);
                                stream.on('finish', stream.end);

                            }).on('error', err => {
                                console.warn(err);
                            });

                        }
                    }
                });
            }
        });

        if (latestTweetId) listInfo[listId].latestTweetId = latestTweetId;

    } catch (err) {
        // TODO: better error handling
        console.warn(err);
    }
}));

listsPromise.then(() => {
    fs.writeFileSync('./config/listInfo.json', JSON.stringify(listInfo, null, '\t'));
});