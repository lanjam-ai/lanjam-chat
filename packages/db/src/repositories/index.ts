import type { Database } from "../client.js";
import { ConversationFileRepository } from "./conversation-files.js";
import { ConversationGroupRepository } from "./conversation-groups.js";
import { ConversationRepository } from "./conversations.js";
import { EmbeddingRepository } from "./embeddings.js";
import { FileRepository } from "./files.js";
import { LlmModelRepository } from "./llm-models.js";
import { MessageFileRepository } from "./message-files.js";
import { MessageRepository } from "./messages.js";
import { OwnerAuditLogRepository } from "./owner-audit-log.js";
import { OwnerSessionRepository } from "./owner-sessions.js";
import { SafetyRuleRepository } from "./safety-rules.js";
import { SessionRepository } from "./sessions.js";
import { SystemKvRepository } from "./system-kv.js";
import { SystemOwnerRepository } from "./system-owner.js";
import { TagRepository } from "./tags.js";
import { UserModelAcknowledgmentRepository } from "./user-model-acknowledgments.js";
import { UserRepository } from "./users.js";

export {
  UserRepository,
  SessionRepository,
  ConversationRepository,
  MessageRepository,
  MessageFileRepository,
  FileRepository,
  ConversationFileRepository,
  EmbeddingRepository,
  LlmModelRepository,
  SystemKvRepository,
  SafetyRuleRepository,
  UserModelAcknowledgmentRepository,
  TagRepository,
  ConversationGroupRepository,
  SystemOwnerRepository,
  OwnerSessionRepository,
  OwnerAuditLogRepository,
};

export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  messageFiles: MessageFileRepository;
  files: FileRepository;
  conversationFiles: ConversationFileRepository;
  embeddings: EmbeddingRepository;
  llmModels: LlmModelRepository;
  systemKv: SystemKvRepository;
  safetyRules: SafetyRuleRepository;
  userModelAcknowledgments: UserModelAcknowledgmentRepository;
  tags: TagRepository;
  conversationGroups: ConversationGroupRepository;
  systemOwner: SystemOwnerRepository;
  ownerSessions: OwnerSessionRepository;
  ownerAuditLog: OwnerAuditLogRepository;
}

export function createRepositories(db: Database): Repositories {
  return {
    users: new UserRepository(db),
    sessions: new SessionRepository(db),
    conversations: new ConversationRepository(db),
    messages: new MessageRepository(db),
    messageFiles: new MessageFileRepository(db),
    files: new FileRepository(db),
    conversationFiles: new ConversationFileRepository(db),
    embeddings: new EmbeddingRepository(db),
    llmModels: new LlmModelRepository(db),
    systemKv: new SystemKvRepository(db),
    safetyRules: new SafetyRuleRepository(db),
    userModelAcknowledgments: new UserModelAcknowledgmentRepository(db),
    tags: new TagRepository(db),
    conversationGroups: new ConversationGroupRepository(db),
    systemOwner: new SystemOwnerRepository(db),
    ownerSessions: new OwnerSessionRepository(db),
    ownerAuditLog: new OwnerAuditLogRepository(db),
  };
}
