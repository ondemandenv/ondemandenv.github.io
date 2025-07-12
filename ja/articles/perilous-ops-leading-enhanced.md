---
layout: article
title: "危険な道：オペレーター主導のマイクロサービスが分散モノリスを生み出す経緯"
description: "運用チームがモノリスをサービスメッシュに接続されたマイクロサービスに強制的に分解し、元のシステムよりも悪い複雑さを生み出し、制御コンソールを独占し、開発者の生産性を阻害するアンチパターンの詳細な分析。"
permalink: /ja/articles/perilous-ops-leading-enhanced/
date: 2024-01-15
author: "アーキテクチャ進化シリーズ"
tags: ["マイクロサービス", "アンチパターン", "サービスメッシュ", "分散システム", "運用"]
---

# 危険な道：オペレーター主導のマイクロサービスが分散モノリスを生み出す経緯

## エグゼクティブサマリー

モノリシックアプリケーションからマイクロサービスへの道のりは、組織をアーキテクチャの泥沼に引きずり込む可能性のある危険な道で満ちています。最も危険なアンチパターンの1つは、運用チームがマイクロサービスのドグマに駆られ、サービスメッシュ技術を武器に、フェーズ1のモノリスを人為的に分離されたサービスに強制的に分解するときに現れます。このアプローチは、私たちが「分散モノリス」と呼ぶものを生み出します - これは、両方のアーキテクチャパターンの最悪の側面を組み合わせながら、約束された利点を何一つ提供しないシステムです。

この包括的な分析では、オペレーター主導の分解が、サービスメッシュの制御の独占と相まって、元のモノリシックシステムよりも悪いボトルネックをどのように作り出すかを探ります。このアンチパターンから生じる技術的、組織的、および運用上の失敗を検証し、これらのアーキテクチャの罠を認識し回避するためのガイダンスを提供します。

---

## 2つの道：進化 vs 強制的な分解

### フェーズ1：クラシックモノリス（正しい出発点）

危険な道を探る前に、適切に機能するフェーズ1のモノリスがどのようなものかを確認しておきましょう：

<div class="mermaid">
graph TD
    subgraph "フェーズ1：クラシックモノリス（正しい出発点）"
        A1[注文リクエスト] --> B1[モノリシックアプリケーション]
        B1 --> C1[単一トランザクション]
        
        subgraph "1つのプロセス内のビジネスロジック"
            D1[在庫の検証]
            E1[支払いの処理] 
            F1[在庫の更新]
            G1[通知の送信]
        end
        
        C1 --> D1
        D1 --> E1
        E1 --> F1
        F1 --> G1
        
        G1 --> H1[単一のRDSデータベース]
        H1 --> I1[ACID保証]
        I1 --> J1[一貫した応答]
    end
    
    classDef goodPhase fill:#ccffcc,stroke:#00aa00
    classDef process fill:#e1f5fe,stroke:#0277bd
    classDef database fill:#fff3e0,stroke:#f57c00
    
    class A1,B1,C1,J1 goodPhase
    class D1,E1,F1,G1 process
    class H1,I1 database
</div>

**フェーズ1の主な特徴：**
- **単一のトランザクション境界**：すべてのビジネスロジックが1つのデータベーストランザクション内で実行される
- **ACID保証**：完全な一貫性、分離性、および永続性
- **単純化されたデバッグ**：単一プロセス、単一データベース、明確なエラー処理
- **予測可能なパフォーマンス**：ビジネスロジックのステップ間にネットワーク呼び出しがない
- **明確な所有権**：1つのチーム、1つのコードベース、1つのデプロイメントユニット

### アンチパターン：サービスメッシュを持つ分散モノリス

さて、これを危険な道 - 強制的な分解アプローチ - と比較してみましょう：

<div class="mermaid">
graph TD
    subgraph "アンチパターン：サービスメッシュを持つ分散モノリス"
        A2[注文リクエスト] --> B2[在庫サービス]
        
        subgraph "Ops制御のIstioハブ"
            ISTIO[サービスメッシュコントロールプレーン]
            OPS_TEAM[Opsチームがすべてを制御]
            CONSOLE[Istioコントロールコンソール]
            
            OPS_TEAM --> CONSOLE
            CONSOLE --> ISTIO
        end
        
        subgraph "分離されたサービス - 互いに見えない"
            B2[在庫サービス]
            C2[支払いサービス]
            D2[フルフィルメントサービス]
            E2[通知サービス]
        end
        
        subgraph "別々のデータベース - ACIDの喪失"
            F2[在庫RDS]
            G2[支払いRDS]
            H2[フルフィルメントRDS]
            I2[通知RDS]
        end
        
        B2 --> F2
        C2 --> G2
        D2 --> H2
        E2 --> I2
        
        B2 --> |同期呼び出し| ISTIO
        ISTIO --> |ルーティング先| C2
        C2 --> |同期呼び出し| ISTIO
        ISTIO --> |ルーティング先| D2
        D2 --> |同期呼び出し| ISTIO
        ISTIO --> |ルーティング先| E2
        
        subgraph "開発者の不満"
            DEV1[開発チームA - ルーティング変更が必要]
            DEV2[開発チームB - ポリシー更新が必要]
            DEV3[開発チームC - トラフィックスプリットが必要]
            
            DEV1 --> |チケット| OPS_TEAM
            DEV2 --> |チケット| OPS_TEAM
            DEV3 --> |チケット| OPS_TEAM
        end
        
        E2 --> J2[脆弱な応答チェーン]
    end
    
    classDef antiPattern fill:#ffcccc,stroke:#ff0000
    classDef opsControl fill:#fff3e0,stroke:#f57c00
    classDef services fill:#e8f5e8,stroke:#4caf50
    classDef databases fill:#f3e5f5,stroke:#9c27b0
    classDef frustration fill:#ffebee,stroke:#f44336
    
    class A2,J2 antiPattern
    class ISTIO,OPS_TEAM,CONSOLE opsControl
    class B2,C2,D2,E2 services
    class F2,G2,H2,I2 databases
    class DEV1,DEV2,DEV3 frustration
</div>

---

## サービスメッシュコントロールコンソールの独占

### Opsチームの鉄の支配

このアンチパターンの最も陰湿な側面の1つは、運用チームがサービスメッシュコントロールプレーンを独占する方法です。「インフラを管理する」として始まったものが、すぐに「すべてのサービス間通信を制御する」に変わります。

**コントロールコンソールがボトルネックになる：**

- **トラフィックルーティング**：すべてのサービス通信ルールに運用チームの承認が必要
- **セキュリティポリシー**：開発者は自分たちのサービス間の認証/認可を調整できない
- **ロードバランシング**：カナリアデプロイメントのためのトラフィックスプリットが運用プロセスによってブロックされる
- **可観測性**：モニタリングとトレーシングの設定が運用チームによって制御される
- **サーキットブレーカー**：フォールトトレランスパターンには運用チームの介入が必要

### チケットキューのデススパイラル

<div class="mermaid">
sequenceDiagram
    participant Dev as 開発者
    participant Ticket as チケットシステム
    participant Ops as 運用チーム
    participant Istio as サービスメッシュコンソール
    participant Service as ターゲットサービス
    
    Note over Dev,Service: ボトルネックサイクル
    
    Dev->>+Ticket: ルーティング変更リクエストを送信
    Note over Ticket: チケットは数日間キューに滞留
    
    Ticket->>+Ops: Opsがリクエストを確認
    Note over Ops: Opsはビジネスコンテキストを理解していない
    
    Ops->>Dev: 明確化を要求
    Dev->>Ops: ビジネスコンテキストを提供
    
    Ops->>Istio: 設定を変更
    Note over Istio: 変更が他の何かを壊す
    
    Istio->>Service: トラフィックをルーティング
    Service->>Istio: エラー応答
    
    Istio->>Ops: サービス障害のアラート
    Ops->>Ticket: ロールバックチケットを作成
    
    Note over Dev,Service: 数日経ってもまだ機能しない
    
    Ops->>Dev: 設計通りに動作している
    Dev->>Ticket: 経営層にエスカレーション
    
    Ticket-->>-Ops: チケットをクローズ
    Ops-->>-Ticket: チケットがクローズされた
</div>

### YAML設定地獄

インフラストラクチャ・アズ・コードに慣れている運用チームは、サービスメッシュの設定を単なる別のYAML管理問題として扱うことがよくあります。これは以下につながります：

**設定ドリフトの増幅：**
```yaml
# サービスAのIstio設定（Opsが管理）
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: service-a-routing
spec:
  hosts:
  - service-a
  http:
  - match:
    - headers:
        version:
          exact: v1.2.3  # Opsはこのバージョンが非推奨であることを知らない
    route:
    - destination:
        host: service-a
        subset: v1
      weight: 100
```

**Opsが管理するサービスメッシュYAMLの問題点：**
- **古い設定**：Opsはサービスバージョンがいつ変更されるか知らない
- **ビジネスロジックの無知**：ビジネス要件に一致しないルーティングルール
- **セキュリティ設定の誤り**：過度に寛容または過度に制限的なポリシー
- **パフォーマンスのボトルネック**：最適でないロードバランシングとサーキットブレーカーの設定

---

## 同期呼び出しチェーンの悪夢

### 失われたトランザクション境界

このアンチパターンの最も壊滅的な側面は、同期呼び出しパターンを維持しながらACIDプロパティを失うことです：

<div class="mermaid">
sequenceDiagram
    participant Client
    participant ServiceA
    participant ServiceB
    participant ServiceC
    participant ServiceD
    participant RDSA as RDS A
    participant RDSB as RDS B
    participant RDSC as RDS C
    participant RDSD as RDS D
    participant Istio as サービスメッシュ
    
    Note over Client,RDSD: アンチパターン：個別データベースとの同期チェーン
    
    Client->>+ServiceA: 注文を処理
    ServiceA->>+RDSA: 部分的な状態を保存
    RDSA-->>-ServiceA: OK
    
    ServiceA->>+Istio: サービスBにルーティング
    Istio->>+ServiceB: 在庫を検証
    ServiceB->>+RDSB: 在庫を確認
    RDSB-->>-ServiceB: 在庫あり
    ServiceB-->>-Istio: 検証OK
    Istio-->>-ServiceA: 応答
    
    ServiceA->>+Istio: サービスCにルーティング
    Istio->>+ServiceC: 支払いを処理
    ServiceC->>+RDSC: カードに請求
    Note over ServiceC,RDSC: ネットワーク障害！
    RDSC-->>ServiceC: タイムアウト
    ServiceC-->>-Istio: 支払い失敗
    Istio-->>-ServiceA: エラー
    
    Note over ServiceA: さてどうする？ RDS Aに部分的な状態<br/>分散トランザクションなし<br/>手動での補償が必要
    
    ServiceA-->>-Client: エラー（部分的処理の後）
</div>

### 補償パターンの悪夢

同期呼び出しがチェーンの途中で失敗すると、チームは手動での補償を実装することを余儀なくされます：

```java
// アンチパターン：分散モノリスでの手動補償
public class OrderService {
    public OrderResult processOrder(Order order) {
        // ステップ1：注文を保存（ロールバック不可）
        orderRepository.save(order);
        
        try {
            // ステップ2：Istio経由で在庫サービスを呼び出す
            InventoryResult inventory = inventoryService.validateInventory(order);
            
            try {
                // ステップ3：Istio経由で支払いサービスを呼び出す
                PaymentResult payment = paymentService.processPayment(order);
                
                try {
                    // ステップ4：Istio経由でフルフィルメントサービスを呼び出す
                    fulfillmentService.createShipment(order);
                    return OrderResult.success();
                    
                } catch (FulfillmentException e) {
                    // 手動補償地獄の始まり
                    paymentService.refundPayment(order);  // 失敗する可能性あり
                    inventoryService.releaseInventory(order);  // 失敗する可能性あり
                    orderRepository.markAsFailed(order);  // 失敗する可能性あり
                    return OrderResult.failure("フルフィルメント失敗");
                }
            } catch (PaymentException e) {
                inventoryService.releaseInventory(order);  // 失敗する可能性あり
                orderRepository.markAsFailed(order);  // 失敗する可能性あり
                return OrderResult.failure("支払い失敗");
            }
        } catch (InventoryException e) {
            orderRepository.markAsFailed(order);  // 失敗する可能性あり
            return OrderResult.failure("在庫検証失敗");
        }
    }
}
```

---

## 運用上の複雑性の爆発

### 分散障害のデバッグ

かつてはモノリス内の単純なスタックトレースだったものが、分散デバッグの悪夢になります：

**モノリスのデバッグ（単純）：**
```
OrderService.processOrder() line 45
  -> validateInventory() line 67
    -> PaymentService.charge() line 23
      -> DatabaseException: Connection timeout
```

**分散モノリスのデバッグ（悪夢）：**
```
サービスAのログ：「サービスBの呼び出しに成功」
サービスBのログ：「サービスCの呼び出しに成功」  
サービスCのログ：「支払い処理失敗」
Istioのログ：「503 Service Unavailable」
RDS Aのログ：「トランザクションコミット済み」
RDS Bのログ：「トランザクションコミット済み」
RDS Cのログ：「トランザクションロールバック済み」
Kubernetesのログ：「OOMKilledによるPodの再起動」
```

### モニタリングとアラートのカオス

各サービスは独自のモニタリングを必要としますが、ビジネストランザクションはすべてのサービスにまたがります：

- **サービスA**：注文作成成功率を監視
- **サービスB**：在庫検証の遅延を監視
- **サービスC**：支払い処理エラーを監視
- **サービスD**：フルフィルメントキューの深さを監視

**問題点**：「注文処理」が健全であるかどうかを教えてくれる単一のメトリックはありません。4つ以上のサービスにわたる相関関係が必要であり、それぞれが異なるSLIを持ち、異なるチームが所有し、運用チームによって構成されています。

---

## チームダイナミクスの災害

### 逆コンウェイの法則

ビジネス能力を中心にチームを編成する代わりに、強制的な分解は人為的なチームの境界を作り出します：

**以前（モノリス）**：
- **注文チーム**：注文処理フロー全体を所有
- **明確な責任**：成功か失敗かは明白
- **ビジネスとの連携**：チームは完全な顧客ジャーニーを理解

**以後（分散モノリス）**：
- **在庫チーム**：在庫レベルについてのみ知っている
- **支払いチーム**：トランザクションについてのみ知っている
- **フルフィルメントチーム**：出荷についてのみ知っている
- **統合チーム**：全員を調整しようと試みる（そして失敗する）

### 責任転嫁ゲームの始まり

分散モノリスが失敗すると（そしてそれは必ず起こります）、責任のなすりつけ合いは避けられなくなります：

- **在庫チーム**：「我々は有効な在庫レベルを返した」
- **支払いチーム**：「我々は支払いを正常に処理した」
- **フルフィルメントチーム**：我々は出荷リクエストを受け取ったことがない」
- **Opsチーム**：「サービスメッシュは正常に機能している」
- **統合チーム**：「我々のせいではない、タイミングの問題だ」

---

## パフォーマンス低下の現実

### ネットワーク遅延の増大

かつてはプロセス内のメソッド呼び出しだったものが、ネットワーク呼び出しになります：

**フェーズ1モノリスのパフォーマンス**：
- 注文処理：50ms（すべてメモリ内）
- データベーストランザクション：10ms
- **合計**：60ms

**分散モノリスのパフォーマンス**：
- サービスA → サービスB：20ms + 15ms処理
- サービスB → サービスC：25ms + 30ms処理  
- サービスC → サービスD：15ms + 20ms処理
- **合計**：125ms（2倍遅く、障害を含まず）

### リトライストーム問題

サービスが失敗すると、同期的な性質がリトライストームを引き起こします：

```yaml
# Istioのリトライ設定（Opsチームが管理）
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: payment-service-retries
spec:
  host: payment-service
  trafficPolicy:
    outlierDetection:
      consecutiveErrors: 3
      interval: 30s
      baseEjectionTime: 30s
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        maxRequestsPerConnection: 10
        retryPolicy:
          attempts: 3  # これが障害を増幅させる！
          perTryTimeout: 5s
```

**問題点**：支払いサービスが苦戦しているとき、すべての上流サービスが3回リトライし、最悪のタイミングで3倍の負荷増幅を引き起こします。

---

## 進化の道：本来どうあるべきだったか

### 正しい方法：イベント駆動の進化

強制的な分解の代わりに、適切な進化の道は以下のフェーズに従います：

<div class="mermaid">
flowchart TD
    subgraph "危険な進化の道"
        START[フェーズ1：RDSを持つモノリス]
        
        subgraph "間違った方向転換"
            CHOP[サービスへの人為的な分割]
            MESH[サービスメッシュの追加]
            OPS[Opsが制御を握る]
        end
        
        subgraph "分散モノリス地獄"
            SYNC[依然として同期呼び出し]
            MULTI_DB[複数のRDSインスタンス]
            TIGHT[密結合したサービス]
            CONSOLE_HOG[Opsがサービスメッシュコンソールを独占]
        end
        
        subgraph "正しい道（取られなかった）"
            ASYNC[イベント駆動アーキテクチャ]
            PLATFORM[Platform-as-a-Service]
            DECOUPLE[真のサービス独立性]
        end
    end
    
    START --> CHOP
    CHOP --> MESH
    MESH --> OPS
    OPS --> SYNC
    OPS --> MULTI_DB
    OPS --> TIGHT
    OPS --> CONSOLE_HOG
    
    START -.-> |"進化すべきだった"| ASYNC
    ASYNC -.-> PLATFORM
    PLATFORM -.-> DECOUPLE
    
    classDef wrongPath fill:#ffcccc,stroke:#ff0000
    classDef rightPath fill:#ccffcc,stroke:#00aa00
    classDef hell fill:#ff9999,stroke:#cc0000
    
    class CHOP,MESH,OPS wrongPath
    class SYNC,MULTI_DB,TIGHT,CONSOLE_HOG hell
    class ASYNC,PLATFORM,DECOUPLE rightPath
</div>

**正しい進化のフェーズ：**

1. **フェーズ2**：メッセージキューによる非同期処理の導入
2. **フェーズ3**：イベントソーシングと結果整合性の実装
3. **フェーズ4**：Platform-as-a-Serviceのイベントストリーミングインフラの構築
4. **フェーズ5**：ドメインイベントによる真のサービス独立性の達成

---

## 認識パターン：あなたは危険な道にいますか？

### 技術的な危険信号

**サービスメッシュの指標：**
- [ ] Opsチームがすべてのサービスメッシュ設定を制御している
- [ ] 開発者がルーティング変更のためにチケットを提出している
- [ ] サービスメッシュの設定がインフラリポジトリに保存されている
- [ ] サービス間のポリシー（例：リトライ、タイムアウト）が開発者ではなくOpsによって定義されている

**アーキテクチャの指標：**
- [ ] 複数のサービスが同期的に呼び出され、1つのビジネストランザクションを完了する
- [ ] サービスが独自のデータベースを持っているが、依然として同期的に通信している
- [ ] 障害を処理するために複雑な補償ロジック（例：Sagaパターン）が手動で実装されている
- [ ] 新しい機能には、複数の「独立した」サービスにわたるコード変更が必要

### 組織的な危険信号

- [ ] 開発者は「Opsチームが遅い」と不満を言う
- [ ] Opsチームは「開発者が私たちのプロセスに従わない」と不満を言う
- [ ] 障害が発生すると、責任のなすりつけ合いが始まる
- [ ] 開発チームは、自分たちのサービスが本番でどのように実行されているかについての可視性を持っていない
- [ ] 新しいサービスをデプロイするには、手動のOpsゲートが必要

---

## 回復への道：分散モノリスからの脱出方法

このアーキテクチャの袋小路から抜け出すのは困難ですが、不可能ではありません。

### ステップ1：制御を取り戻す - 分散型ガバナンス

Opsチームは、中央集権的な制御を手放し、フェデレーションガバナンスモデルを採用する必要があります。

**分散型ポリシー管理：**
- **開発チームが所有**：各開発チームは、自分たちのサービスに固有のサービスメッシュ設定（リトライ、タイムアウト、ルーティング）を定義し、所有します。
- **GitOps**：これらの設定は、インフラリポジトリではなく、アプリケーションのコードリポジトリに保存されます。
- **Opsが提供するプラットフォーム**：Opsチームは、開発者がポリシーをデプロイおよび管理するためのセルフサービスプラットフォームを提供します。彼らはゲートキーパーではなく、イネーブラーになります。

### ステップ2：同期呼び出しを断ち切る - 非同期イベントの導入

すべての同期呼び出しは、潜在的な障害点です。回復への道は、非同期のイベント駆動通信を導入することから始まります。

<div class="mermaid">
graph TD
    subgraph "回復への道"
        A[注文リクエスト] --> B[注文サービス]
        
        subgraph "イベント駆動フロー"
            B --> | publishes OrderPlaced event | KAFKA[Kafka / Event Bus]
            
            subgraph "独立したサブスクライバー"
                C[在庫サービス]
                D[支払いサービス]
                E[フルフィルメントサービス]
            end
            
            KAFKA --> C
            KAFKA --> D
            KAFKA --> E
        end
        
        subgraph "独立したデータベース"
            F[在庫RDS]
            G[支払いRDS]
            H[フルフィルメントRDS]
        end
        
        C --> F
        D --> G
        E --> H
        
        B --> | Immediate ACK | I[クライアントに応答]
    end
    
    classDef eventDriven fill:#e8f5e8,stroke:#4caf50
    classDef services fill:#e1f5fe,stroke:#0277bd
    classDef kafka fill:#fff3e0,stroke:#f57c00
    
    class KAFKA kafka
    class B,C,D,E services
    class A,I eventDriven
</div>

**イベント駆動の利点：**
- **真の分離**：サービスは互いの存在を知る必要がない
- **回復力**：支払いサービスがダウンしても、注文は受け付けられ、後で処理される
- **スケーラビリティ**：各サービスは独立してスケールできる
- **開発者の自律性**：チームは他のチームをブロックすることなく、新しい機能を追加できる

### ステップ3：チームの再編成 - ビジネスドメインへの回帰

Conwayの法則を味方につけましょう。チームをビジネスドメインを中心に再編成します。

- **注文受付チーム**：注文の受付と`OrderPlaced`イベントの発行を担当
- **在庫管理チーム**：`OrderPlaced`イベントを購読し、在庫を管理する
- **支払い処理チーム**：`OrderPlaced`イベントを購読し、支払いを処理する

---

## 結論：進化させよ、強制するな

オペレーター主導のマイクロサービスへの移行は、善意で舗装された地獄への道です。それは、元のモノリスよりも管理が難しく、パフォーマンスが悪く、脆い分散モノリスを生み出します。

真の回復力と俊敏性は、サービスメッシュの設定をいじくり回すことからではなく、アーキテクチャの原則を根本的に変えることから生まれます。

**重要なポイント：**
- **同期呼び出しは分散モノリスの兆候です。**
- **イベント駆動アーキテクチャは真の分離の鍵です。**
- **Opsチームはゲートキーパーではなく、イネーブラーであるべきです。**
- **開発者の自律性は、生産性の高いチームの前提条件です。**

危険な道を避け、代わりに制御された、イベント駆動の進化の道を選んでください。あなたのチームとあなたの顧客は、あなたに感謝するでしょう。 