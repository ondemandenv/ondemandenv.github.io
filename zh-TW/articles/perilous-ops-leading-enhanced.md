---
layout: article
title: "危險之路：營運主導的微服務如何創造分散式單體系統"
description: "深入分析一種反模式：營運團隊強行將單體系統分解為以服務網格連接的微服務，從而產生比原始系統更嚴重的複雜性，同時獨佔控制台並阻礙開發者生產力。"
permalink: /zh-TW/articles/perilous-ops-leading-enhanced/
date: 2024-01-15
author: "架構演進系列"
tags: ["微服務", "反模式", "服務網格", "分散式系統", "營運"]
---

# 危險之路：營運主導的微服務如何創造分散式單體系統

## 執行摘要

從單體應用程式到微服務的旅程充滿了危險的路徑，可能使組織陷入架構的流沙之中。其中最危險的一種反模式是，當營運團隊在微服務教條的驅使下，並以服務網格技術為武器，強行將第一階段的單體系統分解為人為分離的服務時，便會出現這種情況。這種方法創造了我們所謂的「分散式單體」（Distributed Monolith）—— 一個結合了兩種架構模式最壞方面，卻未能帶來任何承諾好處的系統。

本綜合分析探討了由營運主導的分解，加上對服務網格控制的獨佔，如何造成通常比原始單體系統更嚴重的瓶頸。我們將檢視這種反模式所產生的技術、組織和營運上的失敗，並提供識別和避免這些架構陷阱的指引。

---

## 兩條路徑：演進 vs. 強制分解

### 第一階段：傳統單體系統（正確的起點）

在探討危險路徑之前，讓我們先確立一個正常運作的第一階段單體系統是什麼樣子的：

<div class="mermaid">
graph TD
    subgraph "第一階段：傳統單體系統（正確的起點）"
        A1[訂單請求] --> B1[單體應用程式]
        B1 --> C1[單一交易]
        
        subgraph "單一程序中的業務邏輯"
            D1[驗證庫存]
            E1[處理付款] 
            F1[更新庫存]
            G1[發送通知]
        end
        
        C1 --> D1
        D1 --> E1
        E1 --> F1
        F1 --> G1
        
        G1 --> H1[單一RDS資料庫]
        H1 --> I1[ACID保證]
        I1 --> J1[一致的回應]
    end
    
    classDef goodPhase fill:#ccffcc,stroke:#00aa00
    classDef process fill:#e1f5fe,stroke:#0277bd
    classDef database fill:#fff3e0,stroke:#f57c00
    
    class A1,B1,C1,J1 goodPhase
    class D1,E1,F1,G1 process
    class H1,I1 database
</div>

**第一階段的主要特徵：**
- **單一交易邊界**：所有業務邏輯在單一資料庫交易內執行
- **ACID保證**：完全的一致性、隔離性和持久性
- **簡化的除錯**：單一程序、單一資料庫、清晰的錯誤處理
- **可預測的效能**：業務邏輯步驟之間沒有網路呼叫
- **明確的所有權**：一個團隊、一個程式碼庫、一個部署單元

### 反模式：具有服務網格的分散式單體

現在，將此與危險路徑——強制分解方法——進行對比：

<div class="mermaid">
graph TD
    subgraph "反模式：具有服務網格的分散式單體"
        A2[訂單請求] --> B2[庫存服務]
        
        subgraph "營運控制的Istio中樞"
            ISTIO[服務網格控制平面]
            OPS_TEAM[營運團隊控制一切]
            CONSOLE[Istio控制台]
            
            OPS_TEAM --> CONSOLE
            CONSOLE --> ISTIO
        end
        
        subgraph "相互隔離的服務 - 彼此盲目"
            B2[庫存服務]
            C2[付款服務]
            D2[履行服務]
            E2[通知服務]
        end
        
        subgraph "獨立的資料庫 - ACID喪失"
            F2[庫存RDS]
            G2[付款RDS]
            H2[履行RDS]
            I2[通知RDS]
        end
        
        B2 --> F2
        C2 --> G2
        D2 --> H2
        E2 --> I2
        
        B2 --> |同步呼叫| ISTIO
        ISTIO --> |路由至| C2
        C2 --> |同步呼叫| ISTIO
        ISTIO --> |路由至| D2
        D2 --> |同步呼叫| ISTIO
        ISTIO --> |路由至| E2
        
        subgraph "開發者的挫折"
            DEV1[開發團隊A - 需要路由變更]
            DEV2[開發團隊B - 需要策略更新]
            DEV3[開發團隊C - 需要流量分割]
            
            DEV1 --> |票證| OPS_TEAM
            DEV2 --> |票證| OPS_TEAM
            DEV3 --> |票證| OPS_TEAM
        end
        
        E2 --> J2[脆弱的回應鏈]
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

## 服務網格控制台的壟斷

### 營運團隊的鐵腕控制

這種反模式最陰險的方面之一，是營運團隊如何壟斷服務網格控制平面。最初的「我們將管理基礎設施」很快就變成「我們控制所有服務對服務的通訊」。

**控制台成為瓶頸：**

- **流量路由**：每條服務通訊規則都需要營運批准
- **安全策略**：開發者無法調整自己服務之間的認證/授權
- **負載平衡**：用於金絲雀部署的流量分割被營運流程阻擋
- **可觀測性**：監控和追蹤組態由營運團隊控制
- **斷路器**：容錯模式需要營運團隊介入

### 票證佇列的死亡螺旋

<div class="mermaid">
sequenceDiagram
    participant Dev as 開發者
    participant Ticket as 票證系統
    participant Ops as 營運團隊
    participant Istio as 服務網格控制台
    participant Service as 目標服務
    
    Note over Dev,Service: 瓶頸循環
    
    Dev->>+Ticket: 提交路由變更請求
    Note over Ticket: 票證在佇列中停留數天
    
    Ticket->>+Ops: 營運審核請求
    Note over Ops: 營運不了解業務背景
    
    Ops->>Dev: 請求澄清
    Dev->>Ops: 提供業務背景
    
    Ops->>Istio: 進行組態變更
    Note over Istio: 變更破壞了其他東西
    
    Istio->>Service: 路由流量
    Service->>Istio: 錯誤回應
    
    Istio->>Ops: 警報服務失敗
    Ops->>Ticket: 建立復原票證
    
    Note over Dev,Service: 幾天後仍未解決
    
    Ops->>Dev: 按設計運作
    Dev->>Ticket: 上報管理層
    
    Ticket-->>-Ops: 關閉票證
    Ops-->>-Ticket: 票證已關閉
</div>

### YAML組態地獄

習慣於基礎設施即程式碼的營運團隊，通常將服務網格組態視為另一個YAML管理問題。這導致了：

**組態漂移的放大：**
```yaml
# 服務A的Istio組態（由營運維護）
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
          exact: v1.2.3  # 營運不知道此版本已棄用
    route:
    - destination:
        host: service-a
        subset: v1
      weight: 100
```

**由營運管理的服務網格YAML的問題：**
- **過時的組態**：營運不知道服務版本何時變更
- **對業務邏輯的無知**：與業務需求不匹配的路由規則
- **安全組態錯誤**：過於寬鬆或過於嚴格的策略
- **效能瓶頸**：次優的負載平衡和斷路器設定

---

## 同步呼叫鏈的噩夢

### 喪失的交易邊界

這種反模式最具破壞性的方面，是在維持同步呼叫模式的同時，喪失了ACID屬性：

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
    participant Istio as 服務網格
    
    Note over Client,RDSD: 反模式：與個別資料庫的同步鏈
    
    Client->>+ServiceA: 處理訂單
    ServiceA->>+RDSA: 儲存部分狀態
    RDSA-->>-ServiceA: OK
    
    ServiceA->>+Istio: 路由至服務B
    Istio->>+ServiceB: 驗證庫存
    ServiceB->>+RDSB: 檢查庫存
    RDSB-->>-ServiceB: 有庫存
    ServiceB-->>-Istio: 驗證成功
    Istio-->>-ServiceA: 回應
    
    ServiceA->>+Istio: 路由至服務C
    Istio->>+ServiceC: 處理付款
    ServiceC->>+RDSC: 扣款
    Note over ServiceC,RDSC: 網路故障！
    RDSC-->>ServiceC: 逾時
    ServiceC-->>-Istio: 付款失敗
    Istio-->>-ServiceA: 錯誤
    
    Note over ServiceA: 現在該怎麼辦？部分狀態已存於RDS A<br/>沒有分散式交易<br/>需要手動補償
    
    ServiceA-->>-Client: 錯誤（部分處理後）
</div>

### 補償模式的噩夢

當同步呼叫在鏈的中途失敗時，團隊被迫實作手動補償：

```java
// 反模式：在分散式單體中的手動補償
public class OrderService {
    public OrderResult processOrder(Order order) {
        // 步驟1：儲存訂單（無法回滾）
        orderRepository.save(order);
        
        try {
            // 步驟2：透過Istio呼叫庫存服務
            InventoryResult inventory = inventoryService.validateInventory(order);
            
            try {
                // 步驟3：透過Istio呼叫付款服務
                PaymentResult payment = paymentService.processPayment(order);
                
                try {
                    // 步驟4：透過Istio呼叫履行服務
                    fulfillmentService.createShipment(order);
                    return OrderResult.success();
                    
                } catch (FulfillmentException e) {
                    // 手動補償地獄開始
                    paymentService.refundPayment(order);  // 可能失敗
                    inventoryService.releaseInventory(order);  // 可能失敗
                    orderRepository.markAsFailed(order);  // 可能失敗
                    return OrderResult.failure("履行失敗");
                }
            } catch (PaymentException e) {
                inventoryService.releaseInventory(order);  // 可能失敗
                orderRepository.markAsFailed(order);  // 可能失敗
                return OrderResult.failure("付款失敗");
            }
        } catch (InventoryException e) {
            orderRepository.markAsFailed(order);  // 可能失敗
            return OrderResult.failure("庫存驗證失敗");
        }
    }
}
```

---

## 營運複雜度的爆炸性增長

### 除錯分散式故障

過去在單體系統中只是一個簡單的堆疊追蹤，現在變成了分散式除錯的噩夢：

**單體系統除錯（簡單）：**
```
OrderService.processOrder() line 45
  -> validateInventory() line 67
    -> PaymentService.charge() line 23
      -> DatabaseException: Connection timeout
```

**分散式單體除錯（噩夢）：**
```
服務A日誌：「成功呼叫服務B」
服務B日誌：「成功呼叫服務C」  
服務C日誌：「付款處理失敗」
Istio日誌：「503 Service Unavailable」
RDS A日誌：「交易已提交」
RDS B日誌：「交易已提交」
RDS C日誌：「交易已回滾」
Kubernetes日誌：「因OOMKilled而重新啟動Pod」
```

### 監控與警報的混亂

每個服務都需要自己的監控，但業務交易橫跨所有服務：

- **服務A**：監控訂單建立成功率
- **服務B**：監控庫存驗證延遲
- **服務C**：監控付款處理錯誤
- **服務D**：監控履行佇列深度

**問題**：沒有單一指標能告訴您「訂單處理」是否健康。您需要在4個以上服務之間建立關聯，每個服務都有不同的SLI，由不同團隊擁有，並由營運團隊設定。

---

## 團隊動態的災難

### 逆康威定律

強制分解並非圍繞業務能力組織團隊，而是創造了人為的團隊邊界：

**之前（單體）**：
- **訂單團隊**：擁有整個訂單處理流程
- **責任明確**：成功或失敗是明確的
- **業務對齊**：團隊了解完整的客戶旅程

**之後（分散式單體）**：
- **庫存團隊**：只知道庫存水平
- **付款團隊**：只知道交易
- **履行團隊**：只知道運送
- **整合團隊**：試圖協調所有人（但失敗了）

### 指責遊戲的開始

當分散式單體失敗時（它一定會），互相指責變得不可避免：

- **庫存團隊**：「我們回傳了有效的庫存水平」
- **付款團隊**：「我們成功處理了付款」
- **履行團隊**：「我們從未收到運送請求」
- **營運團隊**：「服務網格運作正常」
- **整合團隊**：「這不是我們的錯，是時序問題」

---

## 效能下降的現實

### 網路延遲的倍增

過去的程序內方法呼叫，變成了網路呼叫：

**第一階段單體系統效能**：
- 訂單處理：50毫秒（全在記憶體中）
- 資料庫交易：10毫秒
- **總計**：60毫秒

**分散式單體效能**：
- 服務A → 服務B：20毫秒 + 15毫秒處理
- 服務B → 服務C：25毫秒 + 30毫秒處理  
- 服務C → 服務D：15毫秒 + 20毫秒處理
- **總計**：125毫秒（慢2倍，不含故障）

### 重試風暴問題

當服務失敗時，同步的特性會產生重試風暴：

```yaml
# Istio重試組態（由營運團隊管理）
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
          attempts: 3  # 這會放大故障！
          perTryTimeout: 5s
```

**問題**：當付款服務遇到困難時，每個上游服務都會重試3次，在最糟糕的時機造成3倍的負載放大。

---

## 演進之路：本該如何發生

### 正確的方式：事件驅動的演進

與其強制分解，正確的演進路徑應遵循以下階段：

<div class="mermaid">
flowchart TD
    subgraph "危險的演進路徑"
        START[第一階段：具有RDS的單體]
        
        subgraph "錯誤的轉折"
            CHOP[人為地將其切分為服務]
            MESH[新增服務網格]
            OPS[營運團隊接管控制]
        end
        
        subgraph "分散式單體地獄"
            SYNC[仍為同步呼叫]
            MULTI_DB[多個RDS實例]
            TIGHT[緊密耦合的服務]
            CONSOLE_HOG[營運團隊獨佔服務網格控制台]
        end
        
        subgraph "正確的路徑（未選擇）"
            ASYNC[事件驅動架構]
            PLATFORM[平台即服務]
            DECOUPLE[真正的服務獨立性]
        end
    end
    
    START --> CHOP
    CHOP --> MESH
    MESH --> OPS
    OPS --> SYNC
    OPS --> MULTI_DB
    OPS --> TIGHT
    OPS --> CONSOLE_HOG
    
    START -.-> |"應演進為"| ASYNC
    ASYNC -.-> PLATFORM
    PLATFORM -.-> DECOUPLE
    
    classDef wrongPath fill:#ffcccc,stroke:#ff0000
    classDef rightPath fill:#ccffcc,stroke:#00aa00
    classDef hell fill:#ff9999,stroke:#cc0000
    
    class CHOP,MESH,OPS wrongPath
    class SYNC,MULTI_DB,TIGHT,CONSOLE_HOG hell
    class ASYNC,PLATFORM,DECOUPLE rightPath
</div>

**正確的演進階段：**

1. **第二階段**：引入帶有訊息佇列的非同步處理
2. **第三階段**：實作事件溯源和最終一致性
3. **第四階段**：建立平台即服務的事件串流基礎設施
4. **第五階段**：透過領域事件實現真正的服務獨立性

---

## 識別模式：您是否正走在危險之路上？

### 技術警訊

**服務網格指標：**
- [ ] 營運團隊控制所有服務網格組態
- [ ] 開發者需提交票證以進行路由變更
- [ ] 服務網格組態儲存在基礎設施儲存庫中
- [ ] 服務間的策略（例如重試、逾時）由營運而非開發者定義

**架構指標：**
- [ ] 多個服務被同步呼叫以完成單一業務交易
- [ ] 服務擁有自己的資料庫，但仍以同步方式通訊
- [ ] 手動實作複雜的補償邏輯（例如Saga模式）來處理故障
- [ ] 新功能需要跨多個「獨立」服務進行程式碼變更

### 組織警訊

- [ ] 開發者抱怨「營運團隊太慢」
- [ ] 營運團隊抱怨「開發者不遵守我們的流程」
- [ ] 發生故障時，開始互相指責
- [ ] 開發團隊對其服務在生產環境中的執行情況缺乏可見性
- [ ] 部署新服務需要經過手動的營運閘門

---

## 回復之路：如何擺脫分散式單體

雖然擺脫這個架構死胡同很困難，但並非不可能。

### 步驟1：奪回控制權 - 分散式治理

營運團隊必須放棄集中控制，採納聯合治理模型。

**分散式策略管理：**
- **開發團隊擁有**：每個開發團隊定義並擁有其服務特定的服務網格組態（重試、逾時、路由）。
- **GitOps**：這些組態儲存在應用程式的程式碼儲存庫中，而非基礎設施儲存庫。
- **營運提供的平台**：營運團隊提供一個自助服務平台，供開發者部署和管理策略。他們成為推動者，而非守門人。

### 步驟2：切斷同步呼叫 - 引入非同步事件

每個同步呼叫都是一個潛在的故障點。回復之路始於引入非同步、事件驅動的通訊。

<div class="mermaid">
graph TD
    subgraph "回復之路"
        A[訂單請求] --> B[訂單服務]
        
        subgraph "事件驅動流程"
            B --> | 發布OrderPlaced事件 | KAFKA[Kafka / 事件匯流排]
            
            subgraph "獨立的訂閱者"
                C[庫存服務]
                D[付款服務]
                E[履行服務]
            end
            
            KAFKA --> C
            KAFKA --> D
            KAFKA --> E
        end
        
        subgraph "獨立的資料庫"
            F[庫存RDS]
            G[付款RDS]
            H[履行RDS]
        end
        
        C --> F
        D --> G
        E --> H
        
        B --> | 立即確認 | I[回應客戶端]
    end
    
    classDef eventDriven fill:#e8f5e8,stroke:#4caf50
    classDef services fill:#e1f5fe,stroke:#0277bd
    classDef kafka fill:#fff3e0,stroke:#f57c00
    
    class KAFKA kafka
    class B,C,D,E services
    class A,I eventDriven
</div>

**事件驅動的優點：**
- **真正的解耦**：服務不需要知道彼此的存在
- **彈性**：即使付款服務中斷，訂單仍可被接受並稍後處理
- **可擴展性**：每個服務都可以獨立擴展
- **開發者自主性**：團隊可以在不阻塞其他團隊的情況下新增功能

### 步驟3：重組團隊 - 回歸業務領域

讓康威定律為您效力。圍繞業務領域重組團隊。

- **訂單接收團隊**：負責接收訂單並發布`OrderPlaced`事件
- **庫存管理團隊**：訂閱`OrderPlaced`事件並管理庫存
- **付款處理團隊**：訂閱`OrderPlaced`事件並處理付款

---

## 結論：要演進，不要強迫

由營運主導的微服務轉型是一條通往地獄的善意之路。它創造了一個比原始單體更難管理、效能更差、更脆弱的分散式單體。

真正的彈性和敏捷性，並非來自於調整服務網格的設定，而是來自於對架構原則的根本性轉變。

**關鍵要點：**
- **同步呼叫是分散式單體的症狀。**
- **事件驅動架構是實現真正解耦的關鍵。**
- **營運團隊應該是推動者，而非守門人。**
- **開發者的自主性是高效團隊的先決條件。**

避免走上危險之路，選擇一條受控的、事件驅動的演進之路。您的團隊和您的客戶將會感謝您。 