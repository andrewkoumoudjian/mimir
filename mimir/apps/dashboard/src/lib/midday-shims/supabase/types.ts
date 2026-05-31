type Table<Row = Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
};

export type Database = {
  public: {
    Tables: Record<string, Table>;
  };
};
