import { getApiHandler } from "~/server/api.js";

export async function loader({ request }: { request: Request }) {
  return getApiHandler()(request);
}
