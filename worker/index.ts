import { createFetchApiHandler } from "../server/apiFetch";
import { D1StoryStore } from "../server/d1StoryStore";

export default {
  async fetch(request, env) {
    const apiResponse = await createFetchApiHandler({
      store: new D1StoryStore(env.DB)
    })(request);

    if (apiResponse) {
      return apiResponse;
    }

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
