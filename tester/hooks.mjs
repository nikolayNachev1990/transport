import Tester from "tester";

export const mochaHooks = {
  beforeAll: async function () {
    this.config = await Tester.config();
    this.seeds = [];
  },

  afterAll: async function () {
    for (const options of this.seeds.reverse()) {
      await Tester.delete(options);
    }
  },
};
