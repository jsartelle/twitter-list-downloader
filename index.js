import fs from 'fs';
import https from 'https';
import luxon from 'luxon';
import path from 'path';
import process from 'process';
import Twitter from 'twitter-lite';

const CONFIG_PATH = './config/config.json';
const METADATA_PATH = './config/metadata.json';

if (!fs.existsSync(path.dirname(CONFIG_PATH))) fs.mkdirSync(path.dirname(CONFIG_PATH));

if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
        "auth": {
            "consumer_key": "API key",
            "consumer_secret": "API secret key",
            "access_token_key": "Access token",
            "access_token_secret": "Access token secret"
        },
        "users": {
            "USER_NAME": {
                "retweets": true
            }
        },
        "lists": {
            "LIST_ID": {
                "retweets": true
            }
        }
    }, null, '\t'));

    console.log('Please configure the app and try again.');
    process.exit();
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
const twitter = new Twitter(config.auth);

if (!fs.existsSync(METADATA_PATH)) {
    fs.writeFileSync(METADATA_PATH, JSON.stringify({
        users: {},
        lists: {}
    }));
}
const metadata = JSON.parse(fs.readFileSync(METADATA_PATH));

const users = Object.entries(config.users || {});
const lists = Object.entries(config.lists || {});

try {
    const usersPromises = users.map(async ([username, options]) => {
        if (!metadata.users[username]) {
            metadata.users[username] = {
                latestTweetId: null
            };
        }

        const config = {
            screen_name: username,
            include_rts: options.retweets,
            count: 200,
            tweet_mode: "extended"
        };

        const statuses = await getMaxStatuses(
            'statuses/user_timeline',
            config,
            options.ignoreLatestTweetId ? null : metadata.users[username].latestTweetId
        );

        console.debug(`Got ${statuses.length} tweets from user ${username}`);

        const { latestTweetId } = saveStatuses(statuses, username, options);
        metadata.users[username].latestTweetId = latestTweetId;

    });

    const listsPromises = lists.map(async ([listId, options]) => {
        if (!metadata.lists[listId]) {
            await twitter.get('lists/show', {
                list_id: listId
            }).then(res => {
                metadata.lists[listId] = {
                    name: res.name,
                    latestTweetId: null
                };
            });
        }

        const config = {
            list_id: listId,
            include_rts: options.retweets,
            count: 1000,
            tweet_mode: "extended",
        };

        const statuses = await getMaxStatuses(
            'lists/statuses',
            config,
            options.ignoreLatestTweetId ? null : metadata.lists[listId].latestTweetId
        );

        console.debug(`Got ${statuses.length} tweets in list ${metadata.lists[listId].name}`);

        const { latestTweetId } = saveStatuses(statuses, metadata.lists[listId].name, options);
        metadata.lists[listId].latestTweetId = latestTweetId;
    });


    Promise.all([...usersPromises, ...listsPromises]).then(() => {
        fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, '\t'));
    });

} catch (err) {
    // TODO: better error handling
    console.error(err);
}

/* --- */

async function getMaxStatuses(endpoint, baseConfig, latestTweetId) {
    let statuses = [], maxId;

    while (true) {
        const requestConfig = { ...baseConfig };

        if (latestTweetId) requestConfig.since_id = latestTweetId;

        if (maxId) requestConfig.max_id = maxId;

        const results = await twitter.get(endpoint, requestConfig);

        if (results.length && maxId !== results[results.length - 1].id_str) {
            statuses = statuses.concat(results);
            maxId = results[results.length - 1].id_str;
        } else {
            return statuses;
        }
    }
}

function saveStatuses(statuses, folderName, options) {
    const baseDir = options.paths?.output ?? `./out/${folderName}/`; // jshint ignore:line
    const retweetDir = options.paths?.retweets ?? path.join(baseDir, 'retweets'); // jshint ignore:line

    const allowedMediaTypes = {
        /* jshint ignore:start */
        "photo": options.mediaTypes?.photo ?? true,
        "video": options.mediaTypes?.video ?? true,
        "animated_gif": options.mediaTypes?.animated_gif ?? true
        /* jshint ignore:end */
    };

    let latestTweetDate, latestTweetId;
    let retweetLog = '';

    statuses.forEach(status => {
        const isRetweet = Boolean(status.retweeted_status || status.quoted_status);
        const tweet = status.retweeted_status || status.quoted_status || status;

        const tweetDate = luxon.DateTime.fromFormat(tweet.created_at, 'EEE MMM dd HH:mm:ss ZZZ yyyy');
        if (!latestTweetDate || tweetDate > latestTweetDate) {
            latestTweetDate = tweetDate;
            latestTweetId = tweet.id_str;
        }

        if (tweet.extended_entities && tweet.extended_entities.media) {
            tweet.extended_entities.media.forEach((media, index) => {
                if (allowedMediaTypes[media.type]) {
                    const dir = isRetweet ? retweetDir : baseDir;

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
                    if (options.dryRun) ext += '_blank';

                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                    const baseDestinationPath = path.join(baseDir, base + ext);
                    const destinationPath = path.join(dir, base + ext);

                    // do not save retweeted media if it already exists in the base folder
                    if (!fs.existsSync(baseDestinationPath) && !fs.existsSync(destinationPath)) {
                        if (options.dryRun) {
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

                        if (isRetweet) {
                            retweetLog += `${status.user.screen_name} : ${base + ext}\n`;
                        }
                    }
                }
            });
        }
    });

    if (options.logRetweets && fs.existsSync(retweetDir)) {
        fs.appendFileSync(path.join(retweetDir, '_retweets.txt'), retweetLog);
    }

    return {
        latestTweetId
    };
}