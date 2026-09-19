declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_GATEWAY_URL?: string;
    readonly EXPO_PUBLIC_GATEWAY_PORT?: string;
  }
}
