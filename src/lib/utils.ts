import {ToastAndroid} from 'react-native';

import {differenceInMinutes} from 'date-fns';
import {Channel, Message} from 'revolt.js';
import {decodeTime} from 'ulid';

import {client, app} from '../Generic';
import {currentTheme, styles} from '../Theme';
import {DEFAULT_MESSAGE_LOAD_COUNT} from './consts';

/**
 * Returns the correct colour as a HEX string/theme variable. Supports regular HEX colours, client variables (e.g. `var(--accent)`)
 * and gradient roles (which, for now, will return as the first colour from the gradient - this will change if React Native adds support for gradients).
 * @param c The string to check over
 */
export function getColour(c: string) {
  // first check for css variables...
  const isVariable = c.match('var');
  if (isVariable) {
    switch (c) {
      case 'var(--error)':
        return currentTheme.error;
      case 'var(--accent)':
        return currentTheme.accentColorForeground;
      case 'var(--foreground)':
        return currentTheme.foregroundPrimary;
      case 'var(--background)':
        return currentTheme.backgroundPrimary;
      default:
        break;
    }
  }

  // ...then check for gradients
  const linearGradientRegex = /linear-gradient\s*\(/;
  const gradientRegex = /(conic|radial|linear)-gradient\s*\(/;
  const degRegex = /[0-9]{0,3}deg,\s*/;
  const bracketRegex = /\)\s*(text)?$/;
  const percentRegex = /[0-9]{0,3}%(,|\))?\s*/;

  const isGradient = c.match(gradientRegex);
  if (isGradient) {
    const isLinear = linearGradientRegex.test(c);
    const filteredC = c.replace(gradientRegex, '').replace(bracketRegex, '');
    const filteredAsArray = filteredC.split(',');

    console.log(
      `[UTILS] getColour detected a gradient role: ${c}, filtered: ${filteredC}, to array: ${filteredAsArray}, ${filteredAsArray[0]}`,
    );

    let first = filteredAsArray[0].trim().split(' ')[0];
    return isLinear
      ? getLinearGradient(filteredAsArray)
      : /in |from |at |to /.test(first)
      ? filteredAsArray[1].trim().split(' ')[0]
      : first;
  }
  // at this point, c is probably just a regular HEX code so return it directly
  return c;
}
/*FIXME: I dont know how to explain this
 * linear-gradient(20deg, #FF424F, rgb(173,20,87)), filtered: 20deg, #FF424F, rgb(173,20,87), to array: 20deg, #FF424F, rgb(173,20,87)
 roleColor={"useAngle":true,"angle":20,"angleCenter":{"x":0.5,"y":0.5},"colors":["#FF424F","rgb(173","20","87)"],"locations":[0,0.25,0.5,0.75]}

 */
function getLinearGradient(s) {
  const degRegex = /([0-9]{0,3})deg\s*/,
    radRegex = /([0-9.]+)rad\s*/,
    gradRegex = /([0-9]{0,3})rad\s*/,
    turnRegex = /([0-9.]+)turn\s*/,
    angleCenter = {x: 0.5, y: 0.5},
    percentRegex = /([0-9]{0,3})%\s*/;
  const fromRad = r => r * (180 / Math.PI);
  const fromGrad = g => g * (180 / 200);
  const fromTurn = t => t * 360;
  const toN = n => (isNaN(+n) ? 0 : +n);
  let useAngle = !1,
    angle = 0,
    start = {x: 0, y: 0},
    end = {x: 0, y: 0};
  const colors: string[] = [],
    locations: number[] = [];
  const it = s[Symbol.iterator]();
  const first = it.next().value;
  if (first.startsWith('to')) {
    let directions;
    (directions = first.split(' ')), directions.shift();
    (directions.includes('bottom') && (end.y = 1)) ||
      (directions.includes('top') && (start.y = 1));
    (directions.includes('right') && (end.x = 1)) ||
      (directions.includes('left') && (start.x = 1));
  } else end.x = 1;
  let e = degRegex.exec(first);
  console.log('[UTILS] e=', e);
  (Array.isArray(e) &&
    e.length > 1 &&
    (angle = toN(e[1])) &&
    (useAngle = true)) ||
    (((e = radRegex.exec(first)), Array.isArray(e)) &&
      e.length > 1 &&
      ((angle = fromRad(toN(e[1]))), (useAngle = true))) ||
    (((e = gradRegex.exec(first)), Array.isArray(e)) &&
      e.length > 1 &&
      ((angle = fromGrad(toN(e[1]))), (useAngle = true))) ||
    (((e = turnRegex.exec(first)), Array.isArray(e)) &&
      e.length > 1 &&
      ((angle = fromTurn(toN(e[1]))), (useAngle = true))) ||
    (colors.push(first) && locations.push(0));

  for (const slice of it) {
    if (slice.startsWith('rgb('))
      colors.push([slice, it.next().value, it.next().value].join(','));
    else {
      const [$c, $s] = slice.trim().split(' ');
      colors.push($c);
      const p = percentRegex.exec($s);
      (Array.isArray(p) && p.length > 1 && locations.push(+p[1] / 100)) ||
        locations.push(NaN);
    }
  }
  if (!app.settings.get('ui.messaging.roleGradients')) {
    return colors.length > 0 ? colors[0] : styles.textDefault.color;
  }
  for (let i = 0; i < locations.length; i++)
    if (isNaN(locations[i])) locations[i] = i / locations.length;
  if (useAngle) return {useAngle, angle, angleCenter, colors, locations};
  else return {start, end, colors, locations};
}

/**
 * Sleep for the specified amount of milliseconds before continuing.
 * @param ms The amount of time to sleep for in milliseconds
 */
export const sleep = (ms: number | undefined) =>
  new Promise((r: any) => setTimeout(r, ms));

/**
 * Parses the given string for pings, channel links and custom emoji
 * @param text The text to parse
 * @returns The parsed text
 */
export function parseRevoltNodes(text: string) {
  text = text.replace(/<@[0-9A-Z]*>/g, ping => {
    let id = ping.slice(2, -1);
    let user = client.users.get(id);
    if (user) {
      return `[@${user.username}](/@${user._id})`;
    }
    return ping;
  });
  text = text.replace(/<#[0-9A-Z]*>/g, ping => {
    let id = ping.slice(2, -1);
    let channel = client.channels.get(id);
    if (channel) {
      return `[#${channel.name
        ?.split(']')
        .join('\\]')
        .split('[')
        .join('\\[')
        .split('*')
        .join('\\*')
        .split('`')
        .join('\\`')}](/server/${channel.server?._id}/channel/${channel._id})`;
    }
    return ping;
  });
  return text;
}

export function getReadableFileSize(size: number | null) {
  return size !== null
    ? size / 1000000 >= 0.01
      ? `${(size / 1000000).toFixed(2)} MB`
      : size / 10000 >= 0.01
      ? `${(size / 1000).toFixed(2)} KB`
      : `${size} bytes`
    : 'Unknown';
}

export function calculateGrouped(msg1: Message, msg2: Message) {
  // if the author is somehow null don't group the message
  if (!msg1.author || !msg2.author) {
    return false;
  }
  return (
    // a message is grouped with the previous message if all of the following is true:
    msg1.author._id === msg2.author._id && // the author is the same
    !(msg2.reply_ids && msg2.reply_ids.length > 0) && // the message is not a reply
    differenceInMinutes(
      // the time difference is less than 7 minutes and
      decodeTime(msg1._id),
      decodeTime(msg2._id),
    ) < 7 &&
    (msg2.masquerade // the masquerade is the same
      ? msg2.masquerade.avatar === msg1.masquerade?.avatar &&
        msg2.masquerade.name === msg1.masquerade?.name
      : true)
  );
}

type FetchInput = {
  id?: string;
  type?: 'before' | 'after';
};

export async function fetchMessages(
  channel: Channel,
  input: FetchInput,
  existingMessages: Message[],
  sliceMessages?: false,
) {
  const type = input.type ?? 'before';
  let params = {
    // input.before ? DEFAULT_MESSAGE_LOAD_COUNT / 2 :
    limit: DEFAULT_MESSAGE_LOAD_COUNT,
  } as {limit: number; before?: string; after?: string};
  params[type] = input.id;
  // if (type == "after") {
  //     params.sort = "Oldest"
  // }
  const res = await channel.fetchMessagesWithUsers(params);
  console.log(
    `[FETCHMESSAGES] Finished fetching ${res.messages.length} message(s) for ${channel._id}`,
  );

  let oldMessages = existingMessages;
  if (sliceMessages) {
    if (input.type === 'before') {
      oldMessages = oldMessages.slice(0, DEFAULT_MESSAGE_LOAD_COUNT / 2 - 1);
    } else if (input.type === 'after') {
      oldMessages = oldMessages.slice(
        DEFAULT_MESSAGE_LOAD_COUNT / 2 - 1,
        DEFAULT_MESSAGE_LOAD_COUNT - 1,
      );
    }
  }
  let messages = res.messages.reverse();
  let result =
    input.type === 'before'
      ? messages.concat(oldMessages)
      : input.type === 'after'
      ? oldMessages.concat(messages)
      : messages;
  console.log(
    `[FETCHEDMESSAGES] Finished preparing fetched messages for ${channel._id}`,
  );

  return result;
}

export function showToast(badgeName: string) {
  ToastAndroid.show(badgeName, ToastAndroid.SHORT);
}
