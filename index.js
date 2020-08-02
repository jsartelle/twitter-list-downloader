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
            "LIST_ID": {
                "retweets": false
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

        const allowedMediaTypes = {
            /* jshint ignore:start */
            "photo": listOptions?.mediaTypes?.photo ?? true,
            "video": listOptions?.mediaTypes?.video ?? true,
            "animated_gif": listOptions?.mediaTypes?.animated_gif ?? true
            /* jshint ignore:end */
        };

        const statusesConfig = {
            list_id: listId,
            include_rts: listOptions.retweets,
            count: 1000,
            tweet_mode: "extended"
        };
        if (!listOptions.ignoreLatestTweetId && listInfo[listId].latestTweetId) {
            statusesConfig.since_id = listInfo[listId].latestTweetId;
        }
        const statuses = await twitter.get('lists/statuses', statusesConfig);

        console.debug(`Got ${statuses.length} tweets in list ${listInfo[listId].name}`);

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
                    if (allowedMediaTypes[media.type]) {
                        const baseDir = listOptions?.paths?.output ?? `./out/${listInfo[listId].name}/`; // jshint ignore:line
                        let dir = baseDir;

                        if (isRetweet) {
                            dir = listOptions?.paths?.retweets ?? path.join(dir, 'retweets'); // jshint ignore:line
                        }

                        const base = `${tweet.user.screen_name}_${tweetDate.toISODate()}_${tweet.id_str}_${index + 1}`;

                        let ext, url;
                        switch (media.type) {
                            case 'photo':
                                ext = path.extname(media.media_url_https);
                                url = media.media_url_https + ':orig';
                                break;
                            case 'video':
                            case 'animated_gif':
                                ext = '.mp4';
                                url = media.video_info.variants.reduce((prev, curr) => {
                                    if (
                                        curr.content_type !== 'video/mp4' ||
                                        curr.bitrate <= prev.bitrate
                                    ) return prev;
                                    return curr;
                                }, media.video_info.variants[0]).url;
                                break;
                        }
                        if (listOptions.dryRun) ext += '_blank';

                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                        const baseDestinationPath = path.join(baseDir, base + ext);
                        const destinationPath = path.join(dir, base + ext);

                        // do not save retweeted media if it already exists in the base folder
                        if (!fs.existsSync(baseDestinationPath) && !fs.existsSync(destinationPath)) {
                            if (listOptions.dryRun) {
                                fs.writeFile(destinationPath, '', (err) => {
                                    if (err) console.warn(err);
                                });

                            } else {
                                const stream = fs.createWriteStream(destinationPath);
                                https.get(url, res => {
                                    res.pipe(stream);
                                    stream.on('finish', stream.end);
                                    stream.on('error', err => console.warn(err));

                                }).on('error', err => {
                                    console.warn(err);
                                });
                            }
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