export interface FileRecord {
  id: string;
  user_id: string;
  conversation_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  minio_object_key: string;
  extracted_text_object_key: string | null;
  extracted_text_preview: string | null;
  extraction_status: string;
  created_at: Date;
}
