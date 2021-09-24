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
                latestTweetId: null,
                latestTweetDate: null
            };
        }

        const config = {
            screen_name: username,
            exclude_replies: "replies" in options ? !options.replies : false,
            include_rts: Boolean(options.retweets),
            count: 200,
            tweet_mode: "extended"
        };

        const statuses = await getMaxStatuses(
            'statuses/user_timeline',
            config,
            options,
            metadata.users[username]
        );

        console.debug(`Got ${statuses.length} tweets from user ${username}`);

        const { latestTweetId, latestTweetDate } = saveStatuses(statuses, username, options);

        if (
            latestTweetDate
            && (
                !metadata.users[username].latestTweetDate
                || luxon.DateTime.fromISO(metadata.users[username].latestTweetDate) < latestTweetDate
            )
        ) {
            metadata.users[username].latestTweetId = latestTweetId;
            metadata.users[username].latestTweetDate = latestTweetDate;
        }

    });

    const listsPromises = lists.map(async ([listId, options]) => {
        if (!metadata.lists[listId]) {
            await twitter.get('lists/show', {
                list_id: listId
            }).then(res => {
                metadata.lists[listId] = {
                    name: res.name,
                    latestTweetId: null,
                    latestTweetDate: null
                };
            });
        }

        const config = {
            list_id: listId,
            exclude_replies: "replies" in options ? !options.replies : false,
            include_rts: Boolean(options.retweets),
            count: 1000,
            tweet_mode: "extended"
        };

        const statuses = await getMaxStatuses(
            'lists/statuses',
            config,
            options,
            metadata.lists[listId]
        );

        console.debug(`Got ${statuses.length} tweets in list ${metadata.lists[listId].name}`);

        const { latestTweetId, latestTweetDate } = saveStatuses(statuses, metadata.lists[listId].name, options);

        if (
            latestTweetDate
            && (
                !metadata.lists[listId].latestTweetDate
                || luxon.DateTime.fromISO(metadata.lists[listId].latestTweetDate) < latestTweetDate
            )
        ) {
            metadata.lists[listId].latestTweetId = latestTweetId;
            metadata.lists[listId].latestTweetDate = latestTweetDate;
        }
    });


    Promise.all([...usersPromises, ...listsPromises]).then(() => {
        fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, '\t'));
    });

} catch (err) {
    // TODO: better error handling
    console.error(err);
}

/* --- */

async function getMaxStatuses(endpoint, baseConfig, options, metadata) {
    const latestTweetDate = luxon.DateTime.fromISO(metadata.latestTweetDate);

    let statuses = [], maxId;

    while (true) {
        const requestConfig = { ...baseConfig };

        if (!options.ignoreLatestTweetId && metadata.latestTweetId) {
            requestConfig.since_id = metadata.latestTweetId;
        }

        if (maxId) requestConfig.max_id = maxId;

        const results = await twitter.get(endpoint, requestConfig);

        if (results.length && maxId !== results[results.length - 1].id_str) {
            statuses = statuses.concat(results);
            maxId = results[results.length - 1].id_str;
        } else {
            // Twitter will often return tweets older than we want even when the since_id parameter is used,
            // so filter out any tweets older than the latestTweetDate.
            // For retweets and quote tweets look at the date of the retweeter's status,
            // not the status that was retweeted or quoted.
            if (!options.ignoreLatestTweetId && metadata.latestTweetDate) {
                statuses = statuses.filter(status => {
                    return luxon.DateTime.fromFormat(status.created_at, 'EEE MMM dd HH:mm:ss ZZZ yyyy')
                        >= latestTweetDate;
                });
            }

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
        latestTweetId,
        latestTweetDate
    };
}