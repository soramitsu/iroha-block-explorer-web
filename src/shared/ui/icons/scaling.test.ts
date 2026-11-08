import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import ClockIcon from './clock.svg';
import CopyIcon from './copy.svg';

test.each([['clock', ClockIcon], ['copy', CopyIcon]] as const)(
  '%s retains its authored viewBox when compiled and resized',
  (_name, component) => {
    const wrapper = mount(component, { attrs: { style: 'width: 12px; height: 12px' } });
    const bounds = wrapper.get('svg').attributes('viewBox')?.split(/\s+/u).map(Number);
    expect(bounds).toHaveLength(4);
    expect(bounds?.[2]).toBeGreaterThan(0);
    expect(bounds?.[3]).toBeGreaterThan(0);
  }
);
