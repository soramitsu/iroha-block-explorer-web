import { expect, test } from 'vitest';
import { countTimeDifference, getLocalTime, getUTCTime } from '@/shared/lib/time';
import { mount } from '@vue/test-utils';
import { i18n } from '@/shared/lib/localization';
import TimeStamp from '@/shared/ui/components/TimeStamp.vue';

test.each([
  [new Date(1730446858833), '01.11.2024 08:40:58 AM GMT+1'],
  [new Date(1730233940352), '29.10.2024 09:32:20 PM GMT+1'],
])('format %s to local time %s', (input, expected) => {
  expect(getLocalTime(input)).toBe(expected);
});

test.each([
  [new Date('2024-09-11T07:22:47.157Z'), '11.09.2024 07:22:47 AM UTC'],
  [new Date(1730233940352), '29.10.2024 08:32:20 PM UTC'],
])('format %s to UTC time %s', (input, expected) => {
  expect(getUTCTime(input)).toBe(expected);
});

const NOW = Date.now();

test.each([
  [new Date(NOW - 1000), '1 sec ago'],
  [new Date(NOW - 10000), '10 secs ago'],
  [new Date(NOW - 60000), '1 min ago'],
  [new Date(NOW - 180000), '3 mins ago'],
  [new Date(NOW - 4000000), '1 hour ago'],
  [new Date(NOW - 18002000), '5 hours ago'],
  [new Date(NOW - 90000000), '1 day ago'],
  [new Date(NOW - 1800000000), '20 days ago'],
  [new Date(NOW + 86_400_000), '0 sec ago'],
])('Correct time difference display', (date, expected) => {
  const wrapper = mount(TimeStamp, {
    props: {
      value: date,
    },
    global: {
      plugins: [i18n],
    },
  });

  expect(wrapper.find('.time-ago').text()).toBe(expected);
});

test.each([
  [new Date(NOW - (1000 * 9 + 999)), false, { precision: 'seconds', value: 9 }],
  [new Date(NOW - (1000 * 9 + 999)), true, { precision: 'seconds', value: 9999 }],
  [new Date(NOW - 1000 * 60 * 3), false, { precision: 'minutes', value: 3 }],
  [new Date(NOW - 1000 * 60 * 60 * 3), false, { precision: 'hours', value: 3 }],
  [new Date(NOW - 1000 * 60 * 60 * 72), false, { precision: 'days', value: 3 }],
  [new Date(NOW + 1000), false, { precision: 'seconds', value: 0 }],
  [new Date(NOW + 1000), true, { precision: 'seconds', value: 0 }],
])('Correct countTimeDifference computation', (date, isDetailed, expected) => {
  const res = countTimeDifference(NOW, date, isDetailed);
  expect(res).toStrictEqual(expected);
});
