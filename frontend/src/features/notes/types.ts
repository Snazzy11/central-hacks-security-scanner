export interface Note {
  id: number;
  title: string;
  body: string;
  is_public: boolean;
  created_at: string;
}

export interface NoteCreate {
  title: string;
  body: string;
  is_public: boolean;
}
