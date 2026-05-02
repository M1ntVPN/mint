export type ConnState = "disconnected" | "connecting" | "connected" | "disconnecting";

export interface Server {
  id: string;
  name: string;
  country: string;
  flag: string;
  ping: number;
  load: number;
  premium?: boolean;
  city?: string;
  protocol?: string;
}

export interface ServerFolder {
  id: string;
  name: string;
  servers: Server[];
}
