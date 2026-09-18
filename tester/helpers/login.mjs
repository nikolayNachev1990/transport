// Logs in as one of the seeded users and returns headers ready to spread
// into a hasura.request({ headers }) call.
class Login {
  tester = null;
  config = {};

  constructor(tester, config) {
    this.tester = tester;
    this.config = config;
  }

  async admin() {
    return this.as(this.config.users.admin);
  }

  async moderator() {
    return this.as(this.config.users.moderator);
  }

  async test() {
    return this.as(this.config.users.test);
  }

  async as({ email, password }) {
    const helpers = await this.tester.helpers(this.config, ["hasura"]);
    const response = await helpers.hasura.request({
      name: "auth_login",
      vars: { email, password },
      pick: (response) => response.data.data.auth_login.data,
    });
    return { authorization: `Bearer ${response.access_token}` };
  }
}

export default Login;
