/**
 * @format
 */
import BackgroundFetch from "react-native-background-fetch";
import notifee, {EventType} from '@notifee/react-native';
import {AppRegistry} from 'react-native';
import {App} from './App';
import {client} from './src/Generic'
import {name as appName} from './app.json';

async function createNotificationFor(msg, defaultnotif){
	let notifs = (await notifee.getDisplayedNotifications()).filter(n => n.id == msg.channel?._id);
	try {
	 notifee.displayNotification({
            title: title,
            data: {
              channel: msg.channel?._id ?? 'UNKNOWN',
              messageID: msg._id,
            },
            body:
              `<b>${msg.author?.username}</b>: ` +
              msg.content
                ?.replaceAll(
                  '<@' + client.user?._id + '>',
                  '@' + client.user?.username,
                )
                .replaceAll('\\', '\\\\')
                .replaceAll('<', '\\<')
                .replaceAll('>', '\\>') +
              (notifs.length > 0 && notifs[0]?.notification.body
                ? notifs[0].notification.body.split('<br>')?.length > 1
                  ? ' <i><br>(and ' +
                    (Number.parseInt(
                      notifs[0]?.notification.body
                        ?.split('<br>')[1]
                        .split(' ')[1] ?? '',
                      10,
                    ) +
                      1) +
                    ' more messages)</i>'
                  : ' <i><br>(and 1 more message)</i>'
                : msg.embeds&&msg.embeds.length > 0 ? '[Embedded message]': msg.attachments ? msg.attachments.length > 1 ? msg.attachments.length+' attachments': '1 attachment': ''),
            android: {
              color: '#1AD4B2',
              smallIcon: 'ic_launcher_monochrome',
              largeIcon:
                msg.channel?.server?.generateIconURL() ||
                msg.author?.generateAvatarURL(),
              pressAction: {
                id: 'default',
                launchActivity: 'site.endl.taiku.rvmob.MainActivity',
              },
              channelId: defaultnotif,
            },
            id: msg.channel?._id,
          });
        } catch (notifErr) {
          console.log(`[NOTIFEE] Error sending notification: ${notifErr}`);
        }
}
const FetchUnreadsTask = async (event) => {
	const notifChannel= notifee.createChannel({id: 'unread',name: 'Unread messages'});
	const taskId = event.taskId, isTimeout = event.timeout;
	if (isTimeout) {
		console.log('[BackgroundFetch] Headless TIMEOUT:', taskId);
		BackgroundFetch.finish(taskId);
		return;
	}
	console.log('[BackgroundFetch] start: ', taskId);
	if(!client){
		console.error('[BackgroundFetch] client is undefined');
		BackgroundFetch.finish(taskId);
		return;
	}
	const unreads = await client.syncFetchUnreads();
    const rawSettings = await client.syncFetchSettings(['notifications']);
    const {server, channel} = JSON.parse(rawSettings.notifications[1])
    console.log('[BackgroundFetch] Config for servers: ', channel)
    console.log('[BackgroundFetch] Config for channels: ', channel)
	let mentions = unreads.filter(u=>Array.isArray(u.mentions));
	mentions = mentions.flatMap(async u=>u.mentions.map(async m=>await client.channels.fetch(u._id.channel).then(c=>c.fetchMessage(m))));
	console.log("[BackgroundFetch] Mentions fetched: ", mentions)
	mentions.forEach(m=>createNotificationFor(m, notifChannel))
	BackgroundFetch.finish(taskId);
}
AppRegistry.registerComponent(appName, () => App);
BackgroundFetch.registerHeadlessTask(FetchUnreadsTask);