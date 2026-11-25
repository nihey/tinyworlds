import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { isCondition, type WeatherCondition } from "@/map/weather";
import { API_URL } from "./donate";

export interface WeatherReport {
  condition: WeatherCondition;
  station: string;
  observedAt: string;
}

const client = new ApolloClient({
  link: new HttpLink({ uri: API_URL }),
  cache: new InMemoryCache(),
});
const query = gql`
  query CityWeather($world: String!) {
    cityWeather(world: $world) {
      condition
      station
      observedAt
    }
  }
`;

export async function fetchWeather(
  world: string,
  signal: AbortSignal,
): Promise<WeatherReport | null> {
  const result = await client.query<{ cityWeather: WeatherReport | null }>({
    query,
    variables: { world },
    fetchPolicy: "no-cache",
    context: {
      queryDeduplication: false,
      fetchOptions: { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
    },
  });
  const report = result.data?.cityWeather;
  return report &&
    isCondition(report.condition) &&
    /^[A-Z0-9]{4}$/.test(report.station) &&
    Number.isFinite(Date.parse(report.observedAt))
    ? report
    : null;
}
