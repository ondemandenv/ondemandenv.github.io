---
layout: article
title: "打破有狀態部署的天花板：DevOps 的維度分區"
permalink: /articles/stateful-deployment-dimensional-partitioning/
---

## **打破有狀態部署的天花板：DevOps 的維度分區**

## **摘要**

現代 DevOps 掌握了無狀態部署的藝術，藍/綠部署和金絲雀發布等模式已成為標準實踐。然而，這些策略通常將最關鍵的企業資產——有狀態的數據——視為一個不可變的單體，只能繞過它，而不能與之協作[[1](https://portworx.com/use-case/kubernetes-blue-green-deployments/)]。這在敏捷性上創造了一個人為的上限，應用程序可以改變，但數據模型卻被凍結在原地。

本文提出了一個針對有狀態系統的統一理論，認為深度致力於數據分區，受到 K-D 樹理論優雅性的啟發，並通過領域驅動設計（DDD）的戰略紀律來實施，是實現真正端到端持續交付的基石。這種**戰略性的架構視角**補充了在[數據處理和存儲系統中探討的戰術實施模式](/articles/kd-tree-software-partition-sequence/)，證明了相同的分區哲學普遍適用於從低級線程到高級部署策略的各個層面。

## **1. 根本性的脫節：為何我們迴避有狀態部署**

在網站可靠性工程（SRE）和 DevOps 的世界裡，存在著強烈的無狀態文化偏見。與模式和數據遷移相關的複雜性和風險導致許多團隊完全避免它們。雖然這最大限度地降低了部署風險，但卻產生了顯著的架構債務。其結果是一種常見的模式：兩個相同的生產環境（藍色和綠色），應用程序代碼可以無縫切換，但數據庫仍然是一個共享的、複雜的依賴項，需要仔細的、通常是手動的同步[[1](https://portworx.com/use-case/kubernetes-blue-green-deployments/)] [[2](https://stackoverflow.com/questions/30152339/how-to-handle-data-changes-in-blue-green-deployment-technique)]。

這個挑戰不僅僅是理論上的。現實世界的服務對於有狀態的藍/綠部署有廣泛的限制，通常禁止更改加密、要求禁用調度程序，或不支持某些複製拓撲[[3](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-considerations.html)]。業界的解決方案通常是增加更複雜的基礎設施——數據同步工具、共享持久存儲和複雜的 CI/CD 管道——來管理問題，而不是從源頭解決它：即架構本身[[1](https://portworx.com/use-case/kubernetes-blue-green-deployments/)] [[4](https://www.edureka.co/community/292037/how-you-automate-blue-green-deployment-for-stateful-services)]。

**與數據處理的聯繫**：有趣的是，在數據處理系統中也存在同樣迴避複雜性的現象。正如在[分區優先系統的普適哲學](/articles/kd-tree-software-partition-sequence/)中所詳述的，開發人員通常會訴諸複雜的協調機制（分佈式事務、跨分區查詢、手動同步），而不是預先在適當的分區策略上進行投資。根本原因相同：**將分區視為技術上的事後考慮，而不是戰略性的架構決策**。

## **2. K-D 樹作為架構的思維模型**

要解決這個問題，我們需要一個更好的思維模型。這個模型可以在一個經典的計算機科學數據結構中找到：k-d 樹。k-d 樹遞歸地對 k 維空間進行分區，循環遍歷各個維度以創建平衡的、獨立的子區域[[5](https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee)]。在每個層級上選擇哪個維度進行分割的戰略選擇，直接決定了結構的效率。

這為軟件架構提供了一個強有力的教訓：我們如何對複雜性進行分區，決定了我們的系統是能夠優雅地擴展，還是在自身重量下崩潰[[5](https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee)]。目標不僅僅是分割數據，而是沿著有意義的維度進行分割，從而在產生的分區之間創造真正的獨立性，這種做法可以提高性能、可用性和運營靈活性[[6](https://www.starburst.io/blog/iceberg-partitioning/)] [[7](https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning)]。

**普適的 K-D 樹原則**：使 K-D 樹高效的相同數學洞察力，普遍適用於整個系統設計。無論您是為 [Kafka 主題、DynamoDB 表或線程模型](/articles/kd-tree-software-partition-sequence/)進行數據分區，還是為部署和服務邊界進行功能分區，原則保持不變：**分區維度的順序和選擇，決定了您是獲得優雅的簡潔性還是偶然的複雜性**。

在數據處理和部署場景中，錯誤的初始分區決策會產生指數級的複雜性。如果首先選擇技術上的便利性（規範化的數據庫模式、團隊組織邊界、基於哈希的分佈），您將永遠與協調的複雜性作鬥爭。如果首先選擇業務領域邊界，您的數據流和部署都會變得自然獨立。

## **3. 從理論到實踐：DDD 作為架構的指南針**

如果說 k-d 樹提供了"什麼"，那麼領域驅動設計（DDD）就提供了"如何"。DDD 是一種將業務領域概念直接映射到軟件工件的方法論[8](https://www.infoq.com/articles/ddd-in-practice/)。其戰略階段致力於識別"有界上下文"——業務領域中的自然接縫，在這些接縫中模型是一致且自包含的[9](https://semaphoreci.com/blog/domain-driven-design-microservices)。

這些有界上下文是我們分區策略所需要的有意義的、與業務對齊的維度。它們使我們能夠超越簡單的技術分區（水平、垂直），並擁抱*功能性分區*，即根據數據如何被系統的特定部分使用來進行聚合[[10](https://hevoacademy.com/data-management/data-partitioning/)]、[[11](https://learn.microsoft.com/en-us/azure/well-architected/design-guides/partition-data)]、[[7](https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning)]。在 DDD 中，一個同時具有狀態和行為的實體成為分區的核心，而一個聚合則成為該分區內一個自包含的、事務性的單元[[8](https://www.infoq.com/articles/ddd-in-practice/)]。

**DDD 的普適應用**：DDD 指導的分區之美在於其普適性。定義部署邊界的相同有界上下文，也定義了最佳的數據分區策略。正如在[數據處理模式](/articles/kd-tree-software-partition-sequence/)中探討的，當您按定義服務邊界的相同業務領域對 Kafka 主題進行分區時，消息會自然地留在分區內，從而消除了對複雜的跨分區協調的需求。當您按定義部署單元的相同客戶或區域邊界對 DynamoDB 表進行分區時，查詢會自然地與數據分佈對齊。

這並非巧合——這是一個普適原則的體現：**業務領域代表了在所有系統層面都成立的自然獨立邊界**。

## **4. 戰略性回報：解鎖有狀態的藍/綠部署**

當一個架構從一開始就設計有與 DDD 對齊的分區時，有狀態部署就從高風險事件轉變為可預測的、可自動化的過程。部署的單元不再僅僅是應用程序；而是應用程序*及其對應的數據分區*。

遷移過程變成了一個遵循清晰、可重複模式的常規操作：

1.  **選擇分區**：識別與正在部署的服務相關的數據分區。
2.  **隔離**：在"藍色"環境中將該分區標記為只讀。這是離線數據遷移策略中的一個核心概念[[7](https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning)]。
3.  **複製與遷移**：將分區的數據複製到"綠色"環境，並應用必要的模式更改或數據轉換。
4.  **驗證**：在綠色環境中對遷移的數據運行自動化測試，以確保完整性和功能性。
5.  **切換**：一旦驗證通過，將綠色分區設置為可寫，並以原子方式將流量從藍色服務切換到綠色服務。
6.  **退役**：現在可以安全地退役藍色環境中的舊分區。

這種方法將數據視為一等公民、可部署的資產，最終使代碼的生命週期與其管理的狀態的生命週期保持一致。

**數據處理的並行性**：請注意，這種部署模式如何反映了在[分區優先的數據系統](/articles/kd-tree-software-partition-sequence/)中描述的處理模式。正如 Kafka 消費者可以按分區獨立擴展，DynamoDB 查詢可以按分區鍵獨立優化一樣，**當部署與相同的業務驅動分區邊界對齊時，部署也變得可獨立管理**。實現高效數據處理的分區，也就是實現獨立部署的分區。

## **5. 綠地悖論：隱藏的挑戰**

與普遍看法相反，在綠地項目中實施這一策略是最困難的[[5](https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee)]。雖然一張白紙似乎很有利，但它缺乏選擇正確分區維度最關鍵的要素：證據。最初的分區決策，既是最根本的也是最難改變的，必須在信息不完整的情況下做出[[12](https://martinfowler.com/architecture/)]。

棕地系統，儘管有技術債務，但它們有歷史。它們的運營傷痕、性能瓶頸和使用模式，為確定真正的業務邊界所在提供了寶貴的數據[[5](https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee)]。綠地項目迫使架構師基於假設做出這些關鍵決策，如果他們沿著方便的技術線路而不是有意義的業務領域進行分區，就有可能創建一個"分佈式單體"[[5](https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee)]、[[9](https://semaphoreci.com/blog/domain-driven-design-microservices)]。

**基於證據的方法**：這個悖論存在於所有系統層面。在[數據處理系統](/articles/kd-tree-software-partition-sequence/)中，為具有歷史吞吐量數據的現有 Kafka 主題優化分區鍵，比為新主題選擇正確的分區鍵更容易。同樣，當您有真實的查詢模式時，識別最佳的 DynamoDB 分區鍵，比在猜測未來的訪問模式時更容易。

在兩個層面上的解決方案是相同的：**從最強有力的可用業務領域證據開始，然後根據運營反饋進行演進**。在信息不完整的情況下，DDD 的戰略性領域建模為做出這些關鍵的早期決策提供了最佳的可用框架。

## **6. 行動呼籲：邁向持續分區的文化**

要構建真正為變革做好準備的系統，組織必須以與對待應用程序代碼同樣的嚴謹態度來對待其數據架構。分區和遷移數據的能力不應是為緊急情況保留的理論上的能力。

受混沌工程的啟發，團隊應採用**每月數據分區測試**。這些常規演練將驗證隔離、遷移和驗證數據分區的能力，將令人畏懼的高風險程序轉變為低壓力、排練純熟的運營能力。

**擴展實踐**：這種實踐應超越部署測試，擴展到數據處理層。團隊應定期驗證其[分區優先的數據處理模式](/articles/kd-tree-software-partition-sequence/)能否在不中斷服務的情況下處理分區的拆分、合併和重新平衡。實現獨立部署的相同分區邊界，也應針對獨立的數據處理可擴展性進行測試。

目標是創建一個**統一的分區文化**，在這種文化中，相同的業務驅動分區策略在數據存儲、數據處理和部署模式中得到一致的應用。當這些層面對齊時，系統在每個層級都表現出自然的彈性和可擴展性。

## **7. 普適的洞察：一個策略，所有層面**

通過擁抱分區原則——從 k-d 樹的理論到 DDD 的實踐——組織最終可以克服有狀態部署的障礙，實現涵蓋其整個系統（包括其最寶貴的資產）的敏捷性水平。

深刻的洞察在於，**相同的分區策略普遍適用**：

-   **數據存儲**：按業務領域對錶、文檔和鍵值存儲進行分區
-   **數據處理**：按相同的業務領域對流、隊列和計算進行分區
-   **系統架構**：按相同的業務領域對服務、部署和團隊進行分區
-   **線程和並發**：按相同的業務領域對處理單元和同步邊界進行分區

當這些分區決策在所有系統層面都對齊時，複雜性不會複合——它仍然是可管理的，因為驅動一層分區的相同業務邏輯，自然也驅動所有層的分區。

正如在[跨數據技術的戰術實施](/articles/kd-tree-software-partition-sequence/)中所探討的，無論您是在設計 Kafka 主題、DynamoDB 分區鍵，還是 Java 線程模型，相同的 DDD 指導的業務邊界都提供了最佳的分區策略。本文展示了這些相同的邊界如何實現先進的部署模式。

分區原則的普適性是其最大的優勢：**一次學會正確分區，相同的策略處處適用**。

1.  [https://portworx.com/use-case/kubernetes-blue-green-deployments/](https://portworx.com/use-case/kubernetes-blue-green-deployments/)
2.  [https://stackoverflow.com/questions/30152339/how-to-handle-data-changes-in-blue-green-deployment-technique](https://stackoverflow.com/questions/30152339/how-to-handle-data-changes-in-blue-green-deployment-technique)
3.  [https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-considerations.html](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/blue-green-deployments-considerations.html)
4.  [https://www.edureka.co/community/292037/how-you-automate-blue-green-deployment-for-stateful-services](https://www.edureka.co/community/292037/how-you-automate-blue-green-deployment-for-stateful-services)
5.  [https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee](https://www.linkedin.com/pulse/art-strategic-partitioning-lessons-from-k-d-trees-design-gary-yang-83gee)
6.  [https.starburst.io/blog/iceberg-partitioning/](https://www.starburst.io/blog/iceberg-partitioning/)
7.  [https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning](https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning)
8.  [https://www.infoq.com/articles/ddd-in-practice/](https://www.infoq.com/articles/ddd-in-practice/)
9.  [https://semaphoreci.com/blog/domain-driven-design-microservices](https://semaphoreci.com/blog/domain-driven-design-microservices)
10. [https://hevoacademy.com/data-management/data-partitioning/](https://hevoacademy.com/data-management/data-partitioning/)
11. [https://learn.microsoft.com/en-us/azure/well-architected/design-guides/partition-data](https://learn.microsoft.com/en-us/azure/well-architected/design-guides/partition-data)
12. [https://martinfowler.com/architecture/](https://martinfowler.com/architecture/)

## 相關文章

-   [軟件的 K-D 樹：為何分區順序決定系統複雜性](/articles/kd-tree-software-partition-sequence/) - 探討在數據處理和存儲技術中實施相同分區原則的戰術 