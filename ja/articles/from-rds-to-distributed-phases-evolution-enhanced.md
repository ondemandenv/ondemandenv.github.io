---
layout: article
title: "RDS中心から分散システムへ：アーキテクチャフェーズを通じた進化"
description: "現代のアプリケーションアーキテクチャの進化のフェーズを理解するための包括的なガイド - 従来のRDS中心の設計から最終的に一貫性のある分散システムまで"
author: "Gary Y."
date: 2025-02-01
linkedin_url: "https://www.linkedin.com/pulse/from-rds-centric-distributed-systems-evolution-towards-gary-yang-zhyse/"
---

# RDS中心から分散システムへ：アーキテクチャフェーズを通じた進化

*現代のアプリケーションアーキテクチャの進化のフェーズを理解するための包括的なガイド - 従来のRDS中心の設計から最終的に一貫性のある分散システムまで*

**著者：** Gary Y.  
**公開日：** 2025年2月  
**拡張版：** [元のLinkedIn記事](https://www.linkedin.com/pulse/from-rds-centric-distributed-systems-evolution-towards-gary-yang-zhyse/)

---

## エグゼクティブサマリー

現代のアプリケーションアーキテクチャは、従来のRDS中心の設計から、分散された最終的に一貫性のあるシステムへと根本的な転換を遂げています。この進化は直線的な道をたどるのではなく、むしろ**アーキテクチャ理解の明確なフェーズ**を表しており、それぞれが異なる一連の課題とトレードオフに取り組んでいます。

### 主な洞察：
- **フェーズであり、連続したステップではない**：各アーキテクチャアプローチは、組織がそのコンテキストに基づいて採用できる完全なパラダイムを表す
- **同じビジネスプロセス、異なる調整**：すべてのフェーズは、異なるアーキテクチャパターンを使用して同一のビジネス問題を解決する
- **プラットフォームサービスが複雑さを可能にする**：マネージドクラウドサービスは、洗練された分散アーキテクチャへのアクセスを民主化する
- **コンテキストが最適なフェーズを決定する**：最高のアーキテクチャは、スケール、チーム構造、および一貫性の要件に依存する

---

## はじめに：変化するアーキテクチャの風景

数十年にわたり、リレーショナルデータベースシステム（RDS）はアプリケーション開発の基盤でした。その強力な一貫性の保証とACIDプロパティへの準拠は、データを管理するための堅牢で予測可能な基盤を提供しました。開発パラダイムはしばしばRDS中心であり、アプリケーションはデータベーストランザクションに密接に結合され、データ整合性を確保するために`@Transactional`アノテーションを活用していました。

しかし、現代のアプリケーションの要求は、従来のRDSの限界を超えさせています：

### 限界点：
- **スケーラビリティのボトルネック**：垂直スケーリングは物理的および経済的な限界に達する
- **単一障害点**：共有リソースは連鎖的な障害のリスクを生み出す
- **地理的分散**：グローバルな遅延は一貫性の要件と競合する
- **モノリシックな結合**：厳格な依存関係はイノベーションとデプロイメントサイクルを遅らせる
- **技術ロックイン**：均一なスタックは専門ツールの採用を制限する

これらの課題は、明確なフェーズを通じたアーキテクチャの進化を推進しており、それぞれが基本的な分散システムの問題を解決するための異なるアプローチを表しています。

---

## アーキテクチャ進化の4つのフェーズ

これらのフェーズがどのように異なるかを説明するために、それぞれが**同じビジネスプロセス**をどのように処理するかを見てみましょう：在庫の検証、支払いの処理、在庫の更新、および顧客への通知を含むeコマースの注文処理。

### フェーズ1：RDS中心のモノリシックアーキテクチャ

すべてのビジネスロジックがデータベーストランザクション内で実行される従来のアプローチで、スケーラビリティと回復力を犠牲にして強力な一貫性を提供します。

<div class="mermaid">
flowchart TD
    subgraph "フェーズ1：RDS中心のモノリシックアーキテクチャ"
        P1_User["👤 ユーザーリクエスト<br/>iPhoneを2台購入、2000ドル"]
        P1_User --> P1_LB["⚖️ ロードバランサー<br/>NGINX / AWS ALB"]
        P1_LB --> P1_App["📱 モノリシックアプリケーションサーバー<br/>🏗️ 単一のデプロイメントユニット<br/>技術：Java Spring Boot<br/>チーム：単一の開発チーム"]
        
        P1_App --> P1_Trans["🔒 トランザクション開始<br/>ACID保証"]
        P1_Trans --> P1_S1["📦 ステップ1：在庫の検証<br/>SELECT qty FROM products WHERE id='iPhone'<br/>結果：qty=50 >= 2 ✅"]
        
        P1_S1 --> P1_S2["💳 ステップ2：支払いの処理<br/>INSERT INTO payments + 支払いAPIの呼び出し<br/>結果：2000ドル請求済み ✅"]
        
        P1_S2 --> P1_S3["📉 ステップ3：在庫の更新<br/>UPDATE products SET qty=qty-2 WHERE id='iPhone'<br/>結果：iPhoneの数量が48に ✅"]
        
        P1_S3 --> P1_S4["📧 ステップ4：通知の送信<br/>INSERT INTO notifications + メールAPIの呼び出し<br/>結果：メール送信済み ✅"]
        
        P1_S4 --> P1_Commit["✨ トランザクションのコミット<br/>オールオアナッシングの保証"]
        P1_Commit --> P1_DB[("🗄️ 単一のRDSデータベース<br/>PostgreSQL / MySQL<br/>すべてのデータが一か所に：<br/>• productsテーブル<br/>• paymentsテーブル<br/>• ordersテーブル<br/>• notificationsテーブル")]
        
        P1_DB --> P1_Response["✅ 即時の一貫した応答<br/>注文完了 - 強力な一貫性！"]
        P1_Response --> P1_User
        
        subgraph "🎯 フェーズ1の主な特徴"
            P1_Insight["💡 シンプルだが限定的：<br/>• 単一障害点（アプリ + DB）<br/>• ACIDによる強力な一貫性<br/>• 垂直スケーリングのみ<br/>• 小規模チームでの迅速な開発<br/>• すべてのコンポーネントがリソースを共有<br/>• 技術ロックイン（単一スタック）"]
        end
    end
</div>

#### フェーズ1が優れている場合：
- **小〜中規模**：同時ユーザー数10,000人未満
- **強力な一貫性が重要**：金融取引、規制遵守
- **シンプルなチーム構造**：共有コンテキストを持つ単一の開発チーム
- **迅速なプロトタイピング**：新規アプリケーションの市場投入までの最速時間

#### 実装例：
```java
@Service
@Transactional
public class OrderService {
    public OrderResult processOrder(OrderRequest request) {
        try {
            // すべてのステップを単一トランザクションで
            validateInventory(request);           // ステップ1
            PaymentResult payment = processPayment(request); // ステップ2
            updateInventory(request);             // ステップ3
            sendNotification(request);            // ステップ4
            return OrderResult.success();
        } catch (Exception e) {
            // 任意の障害で自動ロールバック
            throw new OrderProcessingException(e);
        }
    }
}
```

---

### フェーズ2：キューベースの非同期処理

メッセージキューを導入してクライアントリクエストと処理を分離し、トランザクション処理を維持しながら応答性を向上させる進化。

<div class="mermaid">
flowchart TD
    subgraph "フェーズ2：キューベースの非同期処理"
        P2_User["👤 ユーザーリクエスト<br/>iPhoneを2台購入、2000ドル"]
        P2_User --> P2_LB["⚖️ ロードバランサー"]
        P2_LB --> P2_API["📱 APIサーバー<br/>🏗️ まだ単一のデプロイメント<br/>技術：Java Spring Boot<br/>チーム：単一の開発チーム"]
        
        P2_API --> P2_Queue["📮 マネージドメッセージキュー<br/>AWS SQS / RabbitMQ / Redis<br/>🌩️ プラットフォームが処理：永続性、配信、リトライ"]
        P2_Queue --> P2_Response["⚡ 即時応答<br/>注文がキューに追加されました - ファイアアンドフォーゲット！"]
        P2_Response --> P2_User
        
        subgraph "🔥 主な洞察：プラットフォームによるクライアントの分離"
            P2_Queue --> P2_Worker["⚙️ バックグラウンドワーカープロセス<br/>同じコードベース、異なるプロセス<br/>APIから独立してスケール"]
            
            P2_Worker --> P2_S1["📦 ステップ1：在庫の検証<br/>SELECT qty FROM products WHERE id='iPhone'<br/>結果：qty=50 >= 2 ✅"]
            
            P2_S1 --> P2_S2["💳 ステップ2：支払いの処理<br/>INSERT INTO payments + 支払いAPIの呼び出し<br/>結果：2000ドル請求済み ✅"]
            
            P2_S2 --> P2_S3["📉 ステップ3：在庫の更新<br/>UPDATE products SET qty=qty-2 WHERE id='iPhone'<br/>結果：iPhoneの数量が48に ✅"]
            
            P2_S3 --> P2_S4["📧 ステップ4：通知の送信<br/>INSERT INTO notifications + メールAPIの呼び出し<br/>結果：メール送信済み ✅"]
        end
        
        P2_S4 --> P2_DB[("🗄️ 共有RDSデータベース<br/>PostgreSQL / MySQL<br/>フェーズ1と同じスキーマ：<br/>• productsテーブル<br/>• paymentsテーブル<br/>• ordersテーブル<br/>• notificationsテーブル")]
        
        P2_DB --> P2_Complete["✅ 非同期処理完了<br/>ユーザーにメールで通知"]
        
        subgraph "🎯 フェーズ2の主なブレークスルー"
            P2_Insight["💡 プラットフォームによる非同期の利点：<br/>• クライアントの応答性が向上<br/>• キュープラットフォームが信頼性を処理<br/>• ワーカーは失敗した操作をリトライ可能<br/>• より良いリソース利用<br/>• まだ単一のコードベース/デプロイメント<br/>• ワーカーが新たなボトルネックになる"]
        end
    end
</div>

#### プラットフォームのブレークスルー：
フェーズ2は、メッセージングのための**マネージドプラットフォームサービス**（AWS SQS、RabbitMQ、Redis）を初めて採用したことを表しており、信頼性の高いメッセージ配信の複雑さを抽象化しています。

#### 主な改善点：
- **クライアントの分離**：リクエストは処理完了を待たない
- **信頼性**：キューの永続性により、リクエストは障害を乗り越える
- **負荷平準化**：ワーカーは持続可能なレートで処理する
- **より良いユーザーエクスペリエンス**：ユーザーアクションへの即時応答

#### 実装例：
```java
@RestController
public class OrderController {
    @Autowired
    private OrderQueue orderQueue;
    
    @PostMapping("/orders")
    public ResponseEntity<String> submitOrder(@RequestBody OrderRequest request) {
        orderQueue.enqueue(request);
        return ResponseEntity.accepted().body("注文は処理のためにキューに追加されました");
    }
}

@Component
public class OrderWorker {
    @RabbitListener(queues = "order.processing")
    @Transactional
    public void processOrder(OrderRequest request) {
        // フェーズ1と同じビジネスロジックだが、非同期
        validateInventory(request);
        processPayment(request);
        updateInventory(request);
        sendNotification(request);
    }
}
```

---

### フェーズ3：ステップレベルのキューアーキテクチャ

各処理ステップ間にキューを導入し、ステップレベルのリトライと障害分離を可能にしながら、デプロイメントの結合を維持するさらなる進化。

<div class="mermaid">
flowchart TD
    subgraph "フェーズ3：ステップレベルのキューアーキテクチャ"
        P3_User["👤 ユーザーリクエスト<br/>iPhoneを2台購入、2000ドル"]
        P3_User --> P3_LB["⚖️ ロードバランサー"]
        P3_LB --> P3_API["📱 APIサーバー<br/>🏗️ まだモノリシックなデプロイメント<br/>技術：Java Spring Boot<br/>チーム：単一の開発チーム"]
        
        P3_API --> P3_Q1["📮 在庫キュー<br/>マネージドメッセージプラットフォーム"]
        P3_Q1 --> P3_Response["⚡ 即時応答<br/>注文処理が開始されました"]
        P3_Response --> P3_User
        
        subgraph "🔥 主な洞察：ステップレベルの障害分離"
            P3_Q1 --> P3_W1["⚙️ 在庫ワーカー<br/>検証ロジックに特化"]
            P3_W1 --> P3_S1["📦 ステップ1：在庫の検証<br/>SELECT qty FROM products WHERE id='iPhone'<br/>結果：qty=50 >= 2 ✅"]
            P3_S1 --> P3_DB[("🗄️ 共有データベース<br/>読み取り：productsテーブル")]
            
            P3_S1 --> P3_Q2["📮 支払いキュー<br/>中間結果が渡される"]
            P3_Q2 --> P3_W2["⚙️ 支払いワーカー<br/>支払いロジックに特化"]
            P3_W2 --> P3_S2["💳 ステップ2：支払いの処理<br/>INSERT INTO payments + API呼び出し<br/>結果：2000ドル請求済み ✅"]
            P3_S2 --> P3_DB2[("🗄️ 共有データベース<br/>書き込み：paymentsテーブル")]
            
            P3_S2 --> P3_Q3["📮 更新キュー<br/>支払い成功の確認"]
            P3_Q3 --> P3_W3["⚙️ 更新ワーカー<br/>在庫更新に特化"]
            P3_W3 --> P3_S3["📉 ステップ3：在庫の更新<br/>UPDATE products SET qty=qty-2<br/>結果：iPhoneの数量が48に ✅"]
            P3_S3 --> P3_DB3[("🗄️ 共有データベース<br/>更新：productsテーブル")]
            
            P3_S3 --> P3_Q4["📮 通知キュー<br/>注文履行の確認"]
            P3_Q4 --> P3_W4["⚙️ 通知ワーカー<br/>通信に特化"]
            P3_W4 --> P3_S4["📧 ステップ4：通知の送信<br/>INSERT INTO notifications + API呼び出し<br/>結果：メール送信済み ✅"]
            P3_S4 --> P3_DB4[("🗄️ 共有データベース<br/>書き込み：notificationsテーブル")]
        end
        
        P3_DB4 --> P3_Complete["✅ すべてのステップ完了<br/>効率的なステップレベルのリトライ"]
        
        subgraph "🎯 フェーズ3の重要な認識"
            P3_Insight["💡 隠れたモノリス問題：<br/>• ステップレベルの効率が達成された<br/>• 各ステップは独立してリトライ可能<br/>• ワーカーは特化しているがまだ結合している<br/>• 同じデプロイメントユニット = 共通の運命<br/>• 同じ技術スタックの制限<br/>❓ キューがそれらを分離しているのに、なぜ一緒に保つのか？"]
        end
    end
</div>

#### 重要な認識：
フェーズ3はしばしば**「隠れたモノリス問題」**を明らかにします - 論理的な分離にもかかわらず、コンポーネントはデプロイメント結合されたままであり、重要な疑問につながります：「これらのステップがすでにキューを介して非同期に通信しているのに、なぜまだそれらを一緒にパッケージングしているのか？」

#### フェーズ3の利点：
- **ステップレベルのリトライ**：操作全体ではなく、失敗したステップのみがリトライする
- **特化したワーカー**：各ワーカーは特定の操作に最適化されている
- **より良いリソース利用**：ステップは独立してスケールできる
- **障害分離**：ステップの障害がプロセス全体をクラッシュさせない

#### 実装例：
```java
// ステップ1：在庫検証ワーカー
@RabbitListener(queues = "inventory.validation")
public class InventoryWorker {
    public void validateInventory(OrderRequest request) {
        if (inventoryService.isAvailable(request.getItems())) {
            IntermediateResult result = new IntermediateResult(request, VALIDATED);

</rewritten_file> 