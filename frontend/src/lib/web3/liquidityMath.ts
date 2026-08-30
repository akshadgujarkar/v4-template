/**
 * Uniswap V3/V4 Liquidity Math — BigInt-only implementation.
 *
 * Computes the correct `liquidityDelta` (L) for a given pair of token
 * amounts and tick range, matching the on-chain TickMath / LiquidityAmounts
 * libraries exactly.
 */

const Q96 = 1n << 96n;

// ── TickMath helpers ──────────────────────────────────────────────────

/**
 * Returns sqrtPriceX96 for a given tick, reproducing Solidity's
 * `TickMath.getSqrtPriceAtTick(tick)` in pure BigInt.
 *
 * Based on the Uniswap V3 TickMath implementation.
 * tick ∈ [-887272, 887272]
 */
export function getSqrtPriceAtTick(tick: number): bigint {
  const absTick = Math.abs(tick);
  if (absTick > 887272) throw new RangeError("tick out of range");

  // magic constants from Uniswap TickMath (Q128 representation)
  let ratio: bigint =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) {
    ratio = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn / ratio;
  }

  // Convert from Q128 to Q96 and round up
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

// ── LiquidityAmounts (maxLiquidityForAmounts) ─────────────────────────

function getLiquidityForAmount0(
  sqrtA: bigint,
  sqrtB: bigint,
  amount0: bigint
): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const intermediate = (sqrtA * sqrtB) / Q96;
  return (amount0 * intermediate) / (sqrtB - sqrtA);
}

function getLiquidityForAmount1(
  sqrtA: bigint,
  sqrtB: bigint,
  amount1: bigint
): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (amount1 * Q96) / (sqrtB - sqrtA);
}

/**
 * Given the current pool sqrtPriceX96 and a tick range, compute the maximum
 * liquidity (L) that can be minted from the provided token amounts.
 *
 * This mirrors Uniswap's `LiquidityAmounts.getLiquidityForAmounts()`.
 */
export function maxLiquidityForAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0: bigint,
  amount1: bigint
): bigint {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);

  if (sqrtPriceX96 <= sqrtA) {
    // Entirely below range → only token0 is required
    return getLiquidityForAmount0(sqrtA, sqrtB, amount0);
  } else if (sqrtPriceX96 < sqrtB) {
    // Current price is inside the range → limited by both tokens
    const liq0 = getLiquidityForAmount0(sqrtPriceX96, sqrtB, amount0);
    const liq1 = getLiquidityForAmount1(sqrtA, sqrtPriceX96, amount1);
    return liq0 < liq1 ? liq0 : liq1;
  } else {
    // Entirely above range → only token1 is required
    return getLiquidityForAmount1(sqrtA, sqrtB, amount1);
  }
}
