// geoip-lite, qrcode, i18n, oauth2-server, passport-apple and
// passport-google-oauth20 all have real @types/* packages installed
// (package.json devDependencies) — no stub needed for those. ipware is the
// one dependency here with no types at all, not even an @types/* package
// (confirmed via `npm view @types/ipware` — 404), so it gets a small local
// declaration covering only what this codebase actually calls.
declare module "ipware" {
  interface IpResult {
    clientIp: string | null;
    clientIpRoutable: boolean;
  }
  function ipware(): { get_ip: (req: unknown) => IpResult };
  export default ipware;
}
