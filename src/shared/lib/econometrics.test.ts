import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  concentrationTopN,
  giniCoefficient,
  herfindahlIndex,
  lorenzCurvePoints,
  median,
  nakamotoCoefficient,
  nearestRankQuantile,
  quantile,
  shannonEntropy,
  theilIndexT,
  normalizedEntropy,
  effectiveNumberFromEntropy,
} from './econometrics';

describe('econometrics', () => {
  it('computes gini coefficient', () => {
    expect(giniCoefficient([new BigNumber(1), new BigNumber(1), new BigNumber(1)])).toBe(0);
    expect(giniCoefficient([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)])).toBeCloseTo(
      0.75,
      8
    );
    expect(giniCoefficient([new BigNumber(1), new BigNumber(2), new BigNumber(3)])).toBeCloseTo(0.2222222, 6);
  });

  it('computes HHI and concentration ratios', () => {
    expect(herfindahlIndex([new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)])).toBeCloseTo(
      0.25,
      8
    );
    expect(herfindahlIndex([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)])).toBeCloseTo(
      1,
      8
    );

    expect(concentrationTopN([new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)], 1)).toBeCloseTo(
      0.25,
      8
    );
    expect(concentrationTopN([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)], 1)).toBeCloseTo(
      1,
      8
    );
  });

  it('computes median and quantiles', () => {
    expect(median([new BigNumber(1), new BigNumber(3), new BigNumber(2)])?.toNumber()).toBe(2);
    expect(median([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)])?.toNumber()).toBe(2.5);

    expect(quantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0)?.toNumber()).toBe(1);
    expect(quantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 1)?.toNumber()).toBe(4);
    expect(quantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0.5)?.toNumber()).toBe(
      2.5
    );

    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0)?.toNumber()).toBe(
      1
    );
    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 1)?.toNumber()).toBe(
      4
    );
    expect(
      nearestRankQuantile([new BigNumber(1), new BigNumber(2), new BigNumber(3), new BigNumber(4)], 0.5)?.toNumber()
    ).toBe(2);
    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(100)], 0.9)?.toNumber()).toBe(100);
    expect(nearestRankQuantile([new BigNumber(1), new BigNumber(100)], 0.99)?.toNumber()).toBe(100);
  });

  it('computes entropy/theil metrics', () => {
    const equal = [new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)];
    expect(theilIndexT(equal)).toBeCloseTo(0, 12);
    expect(shannonEntropy(equal)).toBeCloseTo(Math.log(4), 12);
    expect(normalizedEntropy(equal)).toBeCloseTo(1, 12);
    expect(effectiveNumberFromEntropy(shannonEntropy(equal))).toBeCloseTo(4, 10);

    const concentrated = [new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)];
    expect(shannonEntropy(concentrated)).toBeCloseTo(0, 12);
    expect(normalizedEntropy(concentrated)).toBeCloseTo(0, 12);
    expect(theilIndexT(concentrated)).toBeCloseTo(Math.log(4), 8);
  });

  it('computes Nakamoto coefficient for common thresholds', () => {
    const equal = [new BigNumber(100), new BigNumber(100)];
    expect(nakamotoCoefficient(equal, 0.33)).toBe(1);
    expect(nakamotoCoefficient(equal, 0.51)).toBe(2);
    expect(nakamotoCoefficient(equal, 0.67)).toBe(2);

    const concentrated = [new BigNumber(1), new BigNumber(100)];
    expect(nakamotoCoefficient(concentrated, 0.33)).toBe(1);
    expect(nakamotoCoefficient(concentrated, 0.51)).toBe(1);
    expect(nakamotoCoefficient(concentrated, 0.67)).toBe(1);
  });

  it('computes Lorenz curve points', () => {
    const values = [new BigNumber(1), new BigNumber(1), new BigNumber(1), new BigNumber(1)];
    const points = lorenzCurvePoints(values, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ population: 0, share: 0 });
    expect(points[4]).toEqual({ population: 1, share: 1 });
    expect(points[1]!.share).toBeCloseTo(0.25, 10);
    expect(points[2]!.share).toBeCloseTo(0.5, 10);
    expect(points[3]!.share).toBeCloseTo(0.75, 10);

    const concentrated = lorenzCurvePoints([new BigNumber(0), new BigNumber(0), new BigNumber(0), new BigNumber(10)], 4);
    expect(concentrated[3]!.share).toBeCloseTo(0, 10);
    expect(concentrated[4]!.share).toBeCloseTo(1, 10);
  });

});
