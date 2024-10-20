/* eslint-disable prefer-const */
import { Address, BigDecimal } from "@graphprotocol/graph-ts/index";
import { Bundle, Pair, Token } from "../generated/schema";
import { ADDRESS_ZERO, factoryContract, ONE_BD, ZERO_BD } from "./utils";

let WETH_ADDRESS = "0x48b62137edfa95a428d35c09e44256a739f6b557";
//let WETH_USDT_PAIR = "0x66725a01375bb805ed5ac65dead683019156e9c4";
//let WETH_USDC_PAIR = "0x199b5c9a9fee0662e98c0bc1038b2059d44b4339";


let WETH_USDC_PAIR = "0xcbbe0a6d394b34a486fe9c50bf37bf835cbbae51";

export function getETHPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdcPair = Pair.load(WETH_USDC_PAIR); // usdc is token0
  //let usdtPair = Pair.load(WETH_USDT_PAIR); // usdt is token1

  /*if (usdcPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = usdtPair.reserve1.plus(usdcPair.reserve1);
    if (totalLiquidityBNB.notEqual(ZERO_BD)) {
      let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB);
      let usdcWeight = usdcPair.reserve1.div(totalLiquidityBNB);
      return usdtPair.token1Price.times(usdtWeight).plus(usdcPair.token0Price.times(usdcWeight));
    } else {
      return ZERO_BD;
    }
  } else if (usdtPair !== null) {
    return usdtPair.token1Price;
  } else */
  
  if (usdcPair !== null) {
    return usdcPair.token1Price;
  } else {
    return BigDecimal.fromString("1.56");
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  "0xa2235d059f80e176d931ef76b6c51953eb3fbef4", // DAI
  "0x48b62137edfa95a428d35c09e44256a739f6b557",
  "0x604cc420c95f2ee546a1765b0305f725fd6f75b4"

];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString("0.001");

/**
 * Search through graph to find derived BNB per token.
 * @todo update to be derived BNB (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD;
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex())!;
      if (pair.token0 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token1 = Token.load(pair.token1)!;
        return pair.token1Price.times(token1.derivedETH as BigDecimal); // return token1 per our token * BNB per token 1
      }
      if (pair.token1 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token0 = Token.load(pair.token0)!;
        return pair.token0Price.times(token0.derivedETH as BigDecimal); // return token0 per our token * BNB per token 0
      }
    }
  }
  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {

  if(token0===null || token1===null)
    return ZERO_BD
  
  let price0 = token0.derivedETH!.times(bundle.ethPrice);
  let price1 = token1.derivedETH!.times(bundle.ethPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked fee amount based on token whitelist
 * If both are, return the difference between the token amounts
 * If not, return 0
 */
export function getTrackedFeeVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedETH!.times(bundle.ethPrice);
  let price1 = token1.derivedETH!.times(bundle.ethPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    let tokenAmount0USD = tokenAmount0.times(price0);
    let tokenAmount1USD = tokenAmount1.times(price1);
    if (tokenAmount0USD.ge(tokenAmount1USD)) {
      return tokenAmount0USD.minus(tokenAmount1USD);
    } else {
      return tokenAmount1USD.minus(tokenAmount0USD);
    }
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedETH!.times(bundle.ethPrice);
  let price1 = token1.derivedETH!.times(bundle.ethPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"));
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}
