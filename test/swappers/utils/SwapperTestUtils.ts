import { expect } from "chai";

export const allowanceCheck = async (
    tokens: Array<any>,
    spenders: Array<any>,
    swapper: any,
    allowance: any
) => {
    for(var i = 0; i < tokens.length; i++) {
        const a = await tokens[i].allowance(swapper.address, spenders[i]);
        expect(a).to.eq(allowance);
    }
}