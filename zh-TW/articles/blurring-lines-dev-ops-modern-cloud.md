---
layout: article
title: "現代雲端架構中開發與維運界線的模糊化"
permalink: /zh-TW/articles/blurring-lines-dev-ops-modern-cloud/
---

# 現代雲端架構中開發與維運界線的模糊化

在現代雲端環境中，開發與維運之間的傳統界線正在迅速消失。這種轉變在應用程式程式碼直接管理基礎設施行為、錯誤處理和資料生命週期的情境中尤其明顯——這些職責曾一度牢固地屬於維運領域。正如 James Hamilton 十多年前指出的那樣：「維運和開發之間的明確分工會導致一種『隔牆扔』的方式，這種方式太慢且效率太低」[^8]。今日的雲端原生架構加速了這種融合，創造了許多人現在所稱的 BizDevOps——一種融合業務、開發和維運的現代方法，以簡化流程並加速交付[^1]。

## DynamoDB Streams：開發人員即維運工程師

Amazon DynamoDB Streams 體現了這種轉變，它要求開發人員在建構串流消費應用程式時，必須理解並考慮到維運的動態。

### 分片生命週期管理

DynamoDB 串流分片具有開發人員必須理解的獨特維運特性：

* **有限的生命週期**：分片在寫入方面保持活動狀態長達 4 小時，然後自動輪替到新的分片，資料保留 24 小時[^9]。
* **自動分片管理**：分片是「短暫的：它們會根據需要自動建立和刪除」[^2]。
* **分片分割**：當底層資料表的分割區因為資料量增長或更高的吞吐量需求而增加時，對應的串流分片也會分割以維持效能[^9]。

雖然 AWS Lambda 可以自動化處理來自這些分片的大部分記錄，但開發人員仍必須在設計應用程式時意識到這些維運動態。例如，他們需要考慮到在分割或輪替後，分片探索期間 IteratorAge 延遲可能增加的情況，這可能會影響即時處理的保證。

### 處理順序要求

維持正確的處理順序對於資料完整性至關重要：

> 「因為分片具有譜系（父與子），應用程式必須始終在處理子分片之前處理父分片。這有助於確保串流記錄也以正確的順序處理」[^2]。

這項要求直接影響應用程式架構，並完全落在開發人員的領域內。DynamoDB Streams Kinesis Adapter 透過處理「新的或過期的分片，以及在應用程式執行期間分割的分片」，幫助抽象化了一些複雜性[^12]，但開發人員在設計時仍必須牢記這些維運限制。

### BisectBatchOnFunctionError：為維運彈性編寫程式碼

一個引人注目的例子是開發人員實作維運邏輯的「BisectBatchOnFunctionError」功能，用於處理 DynamoDB Streams 的 Lambda 函數：

> 「使用 BisectBatchOnFunctionError 時，請檢查 OnFailure 目的地訊息中繼資料中的 BatchSize 參數。由於 Lambda 在寫入 OnFailure 目的地時會合併失敗訊息的中繼資料，BatchSize 可能會大於 1」[^3]。

此功能指示 Lambda 在發生錯誤時將有問題的批次分成兩半並分開重試，有效地隔離「毒丸」記錄。開發人員透過程式碼和組態來設定此行為，定義系統在失敗條件下的運作方式——這傳統上屬於維運團隊的職責。

## 事件溯源：開發人員塑造維運資料流

事件溯源是另一個開發人員直接影響資料管理維運方面的領域。

### 狀態重建與讀取模型

在事件溯源系統中，開發人員設計事件以及應用事件的邏輯：

> 「當系統需要重建時，它會讀取日誌中的所有事件並按順序應用它們，以重建系統的狀態。這使得系統可以透過從日誌中重播事件直到某個時間點，來重建到任何時間點的狀態」[^13]。

這種重播機制對於系統維運至關重要——無論是在快取失效後重建狀態，還是建立新的查詢最佳化視圖。透過更新投影邏輯並重播歷史事件來建立全新的結構描述或讀取模型的能力，意味著開發人員積極參與維運資料的轉換和可用性。

### 結構描述演進的挑戰

事件的不可變性為結構描述的演進帶來了獨特的挑戰：

> 「您的共乘應用程式為 TripEnded 事件新增了一個貨幣欄位。會發生什麼問題？」[^5]

由於過去的事件無法更改，開發人員必須實作處理多個版本事件的策略，例如：

* 在事件負載中實作版本號碼
* 建立在重播期間轉換舊版本事件的事件適配器
* 使用向後/向前相容模式[^5]

這個複雜的維運問題——維持與歷史資料格式的相容性——完全是透過開發人員建立的解決方案來管理的。

### 快照作為維運最佳化

快照在事件溯源系統中是一種重要的維運最佳化：

> 「快照是事件溯源系統中常用的最佳化技術。其想法是定期擷取彙總的狀態並將其儲存為快照。然後，在載入彙總時，系統可以從最新的快照開始，只應用在其之後發生的事件，從而減少需要重播的事件數量」[^13]。

決定何時以及如何建立快照——在效能需求與儲存成本之間取得平衡——成為具有直接維運影響的開發決策。

## 重新分片策略：開發與維運的結合

重新分片——在串流處理系統中分割或合併分片的過程——說明了混合的責任模型。

### 重新分片的挑戰

重新分片會對應用程式行為產生重大影響：

> 「重新分片的詛咒：如果在重播期間 RIDE_123 的事件散佈在不同的分片上…」[^5]

雖然平台服務可能會自動化重新分片的機制，但開發人員必須設計能夠應對這些變化的應用程式。這需要理解重新分片如何影響分割、排序和平行處理。

### 解決方法與策略

開發人員實作各種策略來處理重新分片的挑戰：

* **順序感知的分割**：確保相關事件保持在一起
* **確定性狀態機**：無論事件順序如何，都能正確重建狀態[^5]
* **冪等性**：提供防止重複處理的安全網

這些策略代表了直接嵌入應用程式程式碼中的維運邏輯。

## Kafka Workers：傳統的維運管理方法

與整合的 BizDevOps 模型相反，像 Kafka 這樣的某些平台在開發和維運之間保持了更傳統的分離。例如，Kafka Workers 是「一個統一從 Kafka 消費記錄並由使用者定義的 WorkerTasks 處理它們的客戶端函式庫」[^14]。

在此模型中：

* 維運團隊管理 Kafka 叢集環境，處理「容量規劃、效能調整、叢集設定和持續監控」[^7]
* 開發人員專注於實作處理記錄的 WorkerTasks

這種分離阻礙了像自動二分有問題批次這樣的高階功能的實作，因為維運基礎設施與應用程式邏輯保持分離。Kafka 工程師「設計安全穩健的 Kafka 系統」並「執行實體基礎設施部署」[^7]，而開發人員則在該基礎設施的限制內實作業務邏輯。

## BizDevOps 革命

業務、開發和維運的融合代表了組織如何進行軟體交付的根本性轉變：

> 「BizDevOps 將 [DevOps] 方法擴展到更廣泛的業務考量，培養一種將技術努力與業務優先順序保持一致的整體軟體開發方法」[^1]。

這種整合帶來了顯著的好處：

* **打破孤島**：「打破孤島並重組團隊，以促進跨職能協作和溝通」[^1]
* **更快的交付**：消除獨立團隊之間的交接，加速了開發生命週期
* **提高品質**：了解維運問題的開發人員能建構出更具彈性的系統

然而，這種轉變也帶來了挑戰：

* **更陡峭的學習曲線**：「由於缺乏文件和流程，新開發人員的學習曲線非常陡峭」[^8]
* **待命責任**：「開發人員必須攜帶呼叫器。輪流待命，待命人員必須在 15 分鐘內回應一級嚴重性事件」[^8]
* **平衡優先順序**：「對於某些團隊來說，維運負擔完全佔主導地位，使得處理新功能變得非常困難」[^8]

## 根本的分割決策

開發-維運的邊界代表了計算歷史上最根本的分割決策之一。就像決定系統複雜性的 [K-D 樹分割順序](/articles/kd-tree-software-partition-sequence/)一樣，在開發和維運之間劃清界線的選擇，對系統如何演進具有指數級的影響。

歷史上，這種分割在以下情況下是合理的：
* 硬體昂貴且需要專業知識
* 變更風險高且不頻繁
* 維運涉及實體基礎設施管理

但在雲端環境中，這種傳統的分割所產生的複雜性比解決的還要多。現代雲端平台抽象化了最初為開發-維運分離提供正當性的實體基礎設施問題。當開發人員可以透過單一 API 呼叫來配置資料庫，並用幾行程式碼來設定自動擴展時，傳統的維運專業知識就變得不如特定於應用程式的維運邏輯來得重要。

這反映了[K-D 樹文章](/articles/kd-tree-software-partition-sequence/)的見解：**首先按業務領域分割，其次才是技術問題**。現代應用程式的業務領域邊界越來越多地包括維運行為、錯誤處理和基礎設施管理——而不僅僅是業務邏輯。

## 結論

DynamoDB Streams 和事件溯源的例子表明，現代雲端架構如何從根本上模糊了開發與維運之間的界線。開發人員現在經常編寫直接控制基礎設施行為、錯誤處理和資料生命週期管理的程式碼——這些任務傳統上屬於維運的職權範圍。

這種轉變要求開發人員和維運專業人員都具備新的思維模式和技能。開發人員必須了解維運問題，如分片管理、重新分片期間的資料一致性以及結構描述演進策略。維運團隊必須與開發團隊更緊密地合作，以建立能夠實現這種整合方法的平台。

隨著組織不斷採用雲端原生架構和事件驅動模式，誰建構軟體和誰執行軟體之間的區別將繼續消失。未來屬於那些能夠有效地將業務理解、開發專業知識和卓越維運融合成一個有凝聚力的軟體交付方法的團隊。

傳統的開發-維運分割，就像任何早期的分割決策一樣，具有指數級的後果。那些認識到這個邊界是一個選擇而非不可改變的事實的組織，將更有能力利用雲端原生架構的全部潛力。

---

## 參考文獻

[^1]: [BizDevOps Revolution: Blurring the Lines Between Business, Dev and Ops](https://www.future-processing.com/blog/bizdevops-revolution-blurring-the-lines-between-business-dev-and-ops/)

[^2]: [Amazon DynamoDB Streams Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)

[^3]: [AWS CloudFormation Lambda EventSourceMapping](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventsourcemapping.html)

[^4]: [Microsoft Azure Event Sourcing Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)

[^5]: [Resharding & Schema Evolution in Event Sourcing: Surviving the Hidden Challenges](https://www.linkedin.com/pulse/resharding-schema-evolution-event-sourcing-surviving-hidden-gary-yang-dxjye)

[^6]: [Confluent Connect User Guide](https://docs.confluent.io/platform/current/connect/userguide.html)

[^7]: [Kafka Developer Skills and Responsibilities](https://www.high5hire.com/hire-developers/kafka-developer/)

[^8]: [Blur the Development/Operations Boundary](https://perspectives.mvdirona.com/2007/12/blur-the-developmentoperations-boundary/)

[^9]: [Build Scalable Event-Driven Architectures with Amazon DynamoDB and AWS Lambda](https://aws.amazon.com/blogs/database/build-scalable-event-driven-architectures-with-amazon-dynamodb-and-aws-lambda/)

[^12]: DynamoDB Streams Kinesis Adapter Documentation

[^13]: Event Sourcing Systems Documentation

[^14]: Kafka Workers Library Documentation

*原文由 Gary Y. 發表於 [LinkedIn](https://www.linkedin.com/pulse/blurring-lines-between-development-operations-modern-cloud-gary-yang-sznde/)*

## 相關文章

- [軟體的 K-D 樹：為何分割順序決定了系統複雜性](/articles/kd-tree-software-partition-sequence/) - 探討早期的分割決策如何對系統複雜性產生指數級的影響
- [打破有狀態部署的天花板：DevOps 的維度分割](/articles/stateful-deployment-dimensional-partitioning/) - 同樣的分割哲學如何應用於部署策略

</rewritten_file> 