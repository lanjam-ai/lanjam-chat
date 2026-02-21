import { getApiHandler } from "~/server/api.js";

export async function action({ request }: { request: Request }) {
  return getApiHandler()(request);
}
