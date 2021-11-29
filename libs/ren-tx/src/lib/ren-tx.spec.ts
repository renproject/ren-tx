import { renTx } from './ren-tx';

describe('renTx', () => {
  it('should work', () => {
    expect(renTx()).toEqual('ren-tx');
  });
});
