import { isPublicAddress } from './public-address.js';

describe('isPublicAddress', () => {
  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255',
    '172.32.0.1',
    '100.63.255.255',
    '2606:2800:220:1:248:1893:25c8:1946',
    '2a00:1450:4001:81b::200e',
    '::ffff:93.184.216.34',
  ])('lets %s through', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    ['this machine', '127.0.0.1'],
    ['this machine, elsewhere in its range', '127.8.9.10'],
    ['no address', '0.0.0.0'],
    ['a private network', '10.1.2.3'],
    ['a private network', '172.16.0.1'],
    ['a private network', '172.31.255.254'],
    ['a private network', '192.168.1.1'],
    ['a shared network', '100.64.0.1'],
    ['the metadata service', '169.254.169.254'],
    ['a documentation range', '203.0.113.7'],
    ['a benchmark range', '198.18.0.1'],
    ['multicast', '224.0.0.1'],
    ['broadcast', '255.255.255.255'],
    ['this machine, IPv6', '::1'],
    ['no address, IPv6', '::'],
    ['a private IPv6 network', 'fd12:3456:789a::1'],
    ['link-local IPv6', 'fe80::1'],
    ['multicast IPv6', 'ff02::1'],
    ['a private address written as IPv6', '::ffff:10.0.0.1'],
    ['this machine written as IPv6', '::ffff:127.0.0.1'],
    ['an address behind NAT64', '64:ff9b::a00:1'],
    ['an address inside 6to4', '2002:a00:1::1'],
    ['Teredo', '2001:0:4136:e378:8000:63bf:3fff:fdd2'],
    ['a documentation range, IPv6', '2001:db8::1'],
    ['a name', 'example.com'],
    ['nothing', ''],
  ])('refuses %s (%s)', (_what, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});
