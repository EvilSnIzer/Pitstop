export type Session = {
  id: number;
  status: "in_progress" | "diagnosed" | "booked";
  diagnosis_ready: boolean;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
};

export type Diagnosis = {
  id: number;
  summary: string;
  recommended_service: string;
  confidence: number;
  created_at: string;
};

export type Booking = {
  id: number;
  status: "pending" | "confirmed" | "cancelled";
  scheduled_at: string;
  created_at: string;
};

export type History = {
  session: Session;
  messages: Message[];
  diagnosis: Diagnosis | null;
  booking: Booking | null;
  older_cursor: number | null;
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
