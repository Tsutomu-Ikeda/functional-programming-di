# Clean Architecture with Dependency Injection

このプロジェクトは、クリーンアーキテクチャの原則に従い、高度な依存性注入（DI）システムを実装したNode.js/TypeScriptアプリケーションです。

## 🏗️ アーキテクチャ概要

### クリーンアーキテクチャ層

```
src/
├── domain/           # ドメイン層 - ビジネスエンティティとルール
├── application/      # アプリケーション層 - ユースケースとポート
├── infrastructure/   # インフラストラクチャ層 - 外部システムとの接続
└── presentation/     # プレゼンテーション層 - API エンドポイント
```

### 依存性注入システム

カスタムDIコンテナを実装し、以下の機能を提供：

- **ライフサイクル管理**: `singleton`, `scoped`, `transient`
- **リクエストスコープ**: リクエストごとの独立したコンテナ
- **自動リソース管理**: スコープ終了時の自動クリーンアップ
- **型安全性**: TypeScriptによる完全な型サポート

## 🔧 DIシステムの特徴

### 基本的なDI関数

```typescript
export type Injectable<T, U extends any[], V> = {
  (...args: U): V;
  inject: (deps: Partial<T> | ((d: T) => Partial<T>)) => Injectable<T, U, V>;
};

export const depend = <T extends Record<string, any>, U extends any[], V>(
  dependencies: T,
  cb: (deps: T, ...args: U) => V
): Injectable<T, U, V> => {
  const fn = (...args: U) => cb(dependencies, ...args);
  fn.inject = (deps: Partial<T> | ((d: T) => Partial<T>)) =>
    typeof deps === 'function'
      ? depend({ ...dependencies, ...deps(dependencies) }, cb)
      : depend({ ...dependencies, ...deps }, cb);
  return fn;
};
```

### ライフサイクル管理

#### Singleton
アプリケーション起動時に一度だけ作成され、全リクエストで共有されます。
- データベース接続プール
- 設定オブジェクト
- アプリケーションレベルのロガー

#### Scoped
リクエストごとに新しいインスタンスが作成され、リクエスト終了時に破棄されます。
- リクエストスコープのロガー（リクエストIDを含む）
- ユーザーリポジトリ
- リクエスト固有のサービス

#### Transient
呼び出しごとに新しいインスタンスが作成されます。
- 一時的な計算オブジェクト
- ステートレスなユーティリティ

### リクエストライフサイクル

```typescript
// 1. リクエスト開始時
const requestContext: RequestContext = {
  requestId: uuidv4(),
  startTime: new Date(),
  metadata: { userAgent, ip, method, url }
};

// 2. スコープコンテナ作成
const scopedContainer = globalContainer.createScope(requestContext);

// 3. リクエスト処理
const logger = new RequestScopedLogger(requestContext);
const userRepository = await scopedContainer.resolve<UserRepository>('userRepository');

// 4. リクエスト終了時の自動クリーンアップ
await scopedContainer.dispose();
```

## 🚀 使用方法

### 開発環境での起動

```bash
# 依存関係のインストール
pnpm install

# 開発サーバーの起動
pnpm dev
```

### プロダクション環境での起動

```bash
# ビルド
pnpm build

# 起動
pnpm start
```

### テスト実行

```bash
# テスト実行
pnpm test

# カバレッジ付きテスト
pnpm test:coverage

# ウォッチモード
pnpm test:watch
```

## 📡 API エンドポイント

### REST API

#### ユーザー作成
```bash
POST /api/users
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "Test User",
  "password": "password123"
}
```

#### ユーザー取得
```bash
GET /api/users/:id
```

#### ヘルスチェック
```bash
GET /health
```

#### API ドキュメント
```bash
GET /api
```

## 🔍 実装例

### ユースケースの実装

```typescript
export const createUser = (
  input: CreateUserInput
): RTE.ReaderTaskEither<CreateUserDeps, DomainError, User> =>
  pipe(
    RTE.fromEither(validateCreateUserInput(input)),
    RTE.chainW(checkEmailNotExists),
    RTE.chainW(createAndSaveUser),
    RTE.chainFirstW(sendWelcomeEmailSafely)
  )
```

### DIコンテナの使用

```typescript
// サービス登録
container.register<UserRepository>('userRepository', {
  factory: async () => {
    const pool = await container.resolve<DatabaseConnectionPool>('databasePool');
    return new DatabaseUserRepository(pool.getConnection());
  },
  lifecycle: 'scoped'
});

// サービス解決
const userRepository = await container.resolve<UserRepository>('userRepository');
```

### ログ機能

```typescript
// リクエストスコープのロガー
const logger = new RequestScopedLogger(requestContext);
logger.info('User creation started', { email: input.email })();

// 出力例:
// {"timestamp":"2024-01-01T00:00:00.000Z","level":"info","message":"User creation started","context":{"email":"user@example.com"},"requestId":"123e4567-e89b-12d3-a456-426614174000"}
```

## 🧪 テスト戦略

### 単体テスト
- ドメインロジックのテスト
- ユースケースのテスト
- DIコンテナのテスト

### 統合テスト
- API エンドポイントのテスト
- データベース操作のテスト
- サービス間の連携テスト

## 📁 プロジェクト構造

```
src/
├── domain/
│   ├── user.ts              # ユーザーエンティティ
│   ├── errors.ts            # ドメインエラー定義
│   ├── userFactory.ts       # ユーザーファクトリ
│   └── userValidation.ts    # バリデーションロジック
├── application/
│   ├── ports.ts             # ポート（インターフェース）定義
│   └── usecases/
│       └── createUser.ts    # ユーザー作成ユースケース
├── infrastructure/
│   ├── di/
│   │   ├── types.ts         # DI型定義
│   │   ├── container.ts     # DIコンテナ実装
│   │   └── registry.ts      # サービス登録
│   ├── database/
│   │   └── connection.ts    # データベース接続
│   ├── repositories/
│   │   └── userRepository.ts # ユーザーリポジトリ実装
│   ├── services/
│   │   └── emailService.ts  # メールサービス実装
│   └── logging/
│       └── logger.ts        # ログ機能実装
├── presentation/
│   ├── rest/
│   │   └── routes/
│   │       └── userRoutes.ts # REST APIルート
│   ├── trpc/
│   │   └── router.ts        # tRPC ルーター
│   ├── graphql/
│   │   ├── schema.ts        # GraphQL スキーマ
│   │   └── resolvers.ts     # GraphQL リゾルバー
│   ├── middleware/
│   │   └── diMiddleware.ts  # DI ミドルウェア
│   └── server.ts            # サーバー設定
└── main.ts                  # アプリケーションエントリーポイント
```

## 🌟 主な特徴

1. **クリーンアーキテクチャ**: 依存関係の方向が内側に向かう設計
2. **型安全性**: TypeScriptによる完全な型サポート
3. **関数型プログラミング**: fp-tsを使用したエラーハンドリング
4. **テスタビリティ**: DIによる高いテスタビリティ
5. **スケーラビリティ**: モジュラーな設計による拡張性
6. **監視可能性**: 構造化ログとリクエストトレーシング

## 🔧 環境変数

```bash
# データベース設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=app_db
DB_USER=user
DB_PASSWORD=password
DB_MAX_CONNECTIONS=10

# メール設定
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=user
SMTP_PASSWORD=password
FROM_EMAIL=noreply@example.com

# ログ設定
LOG_LEVEL=info
LOG_FORMAT=json

# サーバー設定
PORT=3000
```

## 📚 参考資料

- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [fp-ts Documentation](https://gcanti.github.io/fp-ts/)
- [Dependency Injection Patterns](https://martinfowler.com/articles/injection.html)
