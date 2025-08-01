---
layout: article
title: "現代のクラウドアーキテクチャにおける開発と運用の境界線の曖昧化"
permalink: /ja/articles/blurring-lines-dev-ops-modern-cloud/
---

# 現代のクラウドアーキテクチャにおける開発と運用の境界線の曖昧化

現代のクラウド環境において、開発と運用の伝統的な境界は急速に溶解しています。この変革は、アプリケーションコードがインフラの振る舞い、エラーハンドリング、データライフサイクルを直接管理するシナリオで特に顕著です。これらはかつて、運用ドメインに固く属していた責任でした。James Hamiltonが10年以上前に指摘したように、「運用と開発の明確な分業は、遅すぎて非効率的な『壁越え』アプローチにつながる」[^8]。今日のクラウドネイティブアーキテクチャは、この収束を加速させ、多くの人が今BizDevOpsと呼ぶものを生み出しました。これは、ビジネス、開発、運用を融合させ、プロセスを合理化し、デリバリーを加速させる現代的なアプローチです[^1]。

## DynamoDB Streams：運用エンジニアとしての開発者

Amazon DynamoDB Streamsは、ストリームを消費するアプリケーションを構築する際に、開発者が運用上のダイナミクスを理解し、考慮する必要があることを示すことで、このシフトを例証しています。

### シャードのライフサイクル管理

DynamoDBストリームシャードには、開発者が理解しなければならない明確な運用上の特性があります。

* **限られた寿命**：シャードは最大4時間書き込み可能でアクティブな状態を保ち、その後自動的に新しいシャードにロールオーバーされ、データは24時間保持されます[^9]。
* **自動シャード管理**：シャードは「一時的なものです：必要に応じて自動的に作成および削除されます」[^2]。
* **シャードの分割**：データ量の増加やスループット要求の増大により、基礎となるテーブルのパーティションが増加すると、対応するストリームシャードもパフォーマンスを維持するために分割されます[^9]。

AWS Lambdaはこれらのシャードからのレコード処理の多くを自動化できますが、開発者は依然としてこれらの運用上のダイナミクスを意識してアプリケーションを設計する必要があります。例えば、分割やロールオーバー後のシャード検出中にIteratorAgeのレイテンシが増加する可能性を考慮に入れる必要があり、これはリアルタイム処理の保証に影響を与える可能性があります。

### 処理順序の要件

正しい処理順序を維持することは、データの整合性にとって重要です。

> 「シャードには系統（親と子）があるため、アプリケーションは常に親シャードを処理してから子シャードを処理しなければなりません。これにより、ストリームレコードも正しい順序で処理されることが保証されます」[^2]。

この要件はアプリケーションアーキテクチャに直接影響を与え、完全に開発者のドメイン内にあります。DynamoDB Streams Kinesis Adapterは、「アプリケーション実行中に分割されたシャードに加えて、新しいシャードや期限切れのシャード」を処理することで複雑さの一部を抽象化するのに役立ちますが[^12]、開発者は依然としてこれらの運用上の制約を念頭に置いて設計する必要があります。

### BisectBatchOnFunctionError：運用上の回復力のためのコーディング

開発者が運用ロジックを実装する説得力のある例は、DynamoDB Streamsを処理するLambda関数の「BisectBatchOnFunctionError」機能です。

> 「BisectBatchOnFunctionErrorを使用する場合、OnFailureデスティネーションメッセージのメタデータにあるBatchSizeパラメータを確認してください。Lambdaは失敗したメッセージのメタデータをOnFailureデスティネーションに書き込む際に統合するため、BatchSizeは1より大きい可能性があります」[^3]。

この機能は、エラーが発生した際に問題のあるバッチを半分に分割して別々に再試行するようLambdaに指示し、効果的に「ポイズンピル」レコードを分離します。開発者はこの振る舞いをコードと設定を通じて構成し、障害条件下でシステムがどのように動作するかを定義します。これは伝統的に運用チームの責任でした。

## イベントソーシング：運用データフローを形成する開発者

イベントソーシングは、開発者がデータ管理の運用面に直接影響を与える別のドメインを表しています。

### 状態の再構築とリードモデル

イベントソースシステムでは、開発者はイベントとそれを適用するロジックの両方を設計します。

> 「システムを再構築する必要がある場合、ログ内のすべてのイベントを読み取り、それらを適用してシステムの状態を再構築します。これにより、その時点までのログからイベントを再生することで、システムを任意の時点に再構築できます」[^13]。

この再生メカニズムは、キャッシュの無効化後に状態を再構築する場合でも、新しいクエリ最適化ビューを作成する場合でも、システムの運用に不可欠です。プロジェクションロジックを更新し、過去のイベントを再生することで全く新しいスキーマやリードモデルを作成できるということは、開発者が運用上のデータ変換と可用性に積極的に参加していることを意味します。

### スキーマ進化の課題

イベントの不変性は、スキーマの進化に特有の課題を生み出します。

> 「あなたのライドシェアアプリがTripEndedイベントに通貨フィールドを追加したとします。何が壊れますか？」[^5]

過去のイベントは変更できないため、開発者は複数のバージョンのイベントを処理するための戦略を実装する必要があります。例えば、以下のようなものです。

* イベントペイロード内にバージョン番号を実装する
* 再生中に古いバージョンのイベントを変換するイベントアダプタを作成する
* 後方/前方互換性パターンを使用する[^5]

この複雑な運用上の懸念、つまり過去のデータ形式との互換性を維持することは、完全に開発者が作成したソリューションを通じて管理されます。

### 運用最適化としてのスナップショット

スナップショットは、イベントソースシステムにおける重要な運用最適化を表しています。

> 「スナップショットは、イベントソーシングシステムで使用される一般的な最適化手法です。集約の状態を定期的にキャプチャし、スナップショットとして保存するという考え方です。その後、集約をロードする際に、システムは最新のスナップショットから開始し、その後に発生したイベントのみを適用できるため、再生する必要のあるイベントの数を減らすことができます」[^13]。

いつ、どのようにスナップショットを作成するかを決定すること、つまりパフォーマンスのニーズとストレージコストのバランスを取ることは、直接的な運用上の影響を持つ開発上の決定となります。

## リシャーディング戦略：開発と運用の融合

リシャーディング、つまりストリーム処理システムでシャードを分割または結合するプロセスは、融合された責任モデルを示しています。

### リシャーディングの課題

リシャーディングはアプリケーションの振る舞いに劇的な影響を与える可能性があります。

> 「リシャーディングの呪い：もしRIDE_123のイベントが再生中にシャード間に散らばったら...」[^5]

プラットフォームサービスがリシャーディングのメカニズムを自動化するかもしれませんが、開発者はこれらの変更に対して回復力のあるアプリケーションを設計しなければなりません。これには、リシャーディングがパーティショニング、順序付け、並列処理にどのように影響するかを理解する必要があります。

### 回避策と戦略

開発者は、リシャーディングの課題に対処するために様々な戦略を実装します。

* **シーケンスを意識したパーティショニング**：関連するイベントがまとまって維持されるようにする
* **決定論的なステートマシン**：イベントの順序に関係なく状態を正しく再構築する[^5]
* **冪等性**：重複処理に対するセーフティネットを提供する

これらの戦略は、アプリケーションコードに直接埋め込まれた運用ロジックを表しています。

## Kafka Workers：従来の運用管理アプローチ

統合されたBizDevOpsモデルとは対照的に、Kafkaのような一部のプラットフォームは、開発と運用の間により伝統的な分離を維持しています。例えば、Kafka Workersは、「Kafkaからのレコード消費と、ユーザー定義のWorkerTasksによる処理を統一するクライアントライブラリ」です[^14]。

このモデルでは：

* 運用チームはKafkaクラスタ環境を管理し、「キャパシティプランニング、パフォーマンスチューニング、クラスタ設定、継続的な監視」を処理します[^7]。
* 開発者はレコードを処理するWorkerTasksの実装に集中します。

この分離は、運用インフラがアプリケーションロジックから分離されたままであるため、問題のあるバッチの自動二分割のような高度な機能の実装を妨げます。Kafkaエンジニアは「安全で堅牢なKafkaシステムを設計」し、「物理的なインフラのデプロイを実行」しますが[^7]、開発者はそのインフラの制約内でビジネスロジックを実装します。

## BizDevOps革命

ビジネス、開発、運用の収束は、組織がソフトウェアデリバリーに取り組む方法における根本的なシフトを表しています。

> 「BizDevOpsは、[DevOps]アプローチを拡張して、より広範なビジネス上の考慮事項を包含し、技術的な取り組みをビジネスの優先事項と整合させる全体的なソフトウェア開発アプローチを育成します」[^1].

この統合は大きな利点をもたらします。

* **サイロの打破**：「サイロを打破し、チームを再構築して、部門間のコラボレーションとコミュニケーションを促進する」[^1]。
* **より速いデリバリー**：別々のチーム間の引き継ぎをなくすことで、開発ライフサイクルを加速させる。
* **品質の向上**：運用上の懸念を理解している開発者は、より回復力のあるシステムを構築する。

しかし、このシフトは課題も提示します。

* **急な学習曲線**：「ドキュメントとプロセスの欠如のため、新しい開発者の立ち上がり曲線は非常に急です」[^8]。
* **オンコール責任**：「開発者はページャーを持つ必要があります。オンコールのローテーションでは、オンコールの人は15分以内にsev-1に対応する必要があります」[^8]。
* **優先順位のバランス**：「一部のチームでは、運用負荷が完全に支配的になり、新しい機能に取り組むことが非常に困難になりました」[^8]。

## 根本的なパーティショニングの決定

開発と運用の境界は、コンピューティング史上最も根本的なパーティショニングの決定の一つを表しています。システムの複雑さを決定する[K-Dツリーのパーティショニングシーケンス](/articles/kd-tree-software-partition-sequence/)のように、開発と運用の間にどこで線を引くかの選択は、システムがどのように進化するかに指数関数的な影響を与えます。

歴史的には、このパーティションは以下の場合に意味がありました。
* ハードウェアが高価で専門知識が必要だったとき
* 変更がリスキーで頻繁ではなかったとき
* 運用には物理的なインフラ管理が含まれていたとき

しかし、クラウド環境では、この伝統的なパーティショニングは解決するよりも多くの複雑さを生み出します。現代のクラウドプラットフォームは、もともと開発と運用の分離を正当化していた物理的なインフラの懸念を抽象化します。開発者が単一のAPI呼び出しでデータベースをプロビジョニングし、数行のコードで自動スケーリングを設定できる場合、従来の運用の専門知識は、アプリケーション固有の運用ロジックよりも関連性が低くなります。

これは、[K-Dツリーの記事](/articles/kd-tree-software-partition-sequence/)からの洞察を反映しています。**ビジネスドメインで最初にパーティションし、次に技術的な懸念でパーティションする**。現代のアプリケーションのビジネスドメインの境界には、ビジネスロジックだけでなく、運用上の振る舞い、エラーハンドリング、インフラ管理がますます含まれるようになっています。

## 結論

DynamoDB Streamsとイベントソーシングの例は、現代のクラウドアーキテクチャが開発と運用の間の境界線を根本的に曖昧にしたことを示しています。開発者は今や、インフラの振る舞い、エラーハンドリング、データライフサイクル管理を直接制御するコードを日常的に書いています。これらは伝統的に運用の権限下にあったタスクです。

このシフトは、開発者と運用専門家の両方から新しい考え方とスキルセットを必要とします。開発者は、シャード管理、リシャーディング中のデータ一貫性、スキーマ進化戦略のような運用上の懸念を理解しなければなりません。運用チームは、この統合されたアプローチを可能にするプラットフォームを作成するために、開発とより密接に協力しなければなりません。

組織がクラウドネイティブアーキテクチャとイベント駆動パターンを採用し続けるにつれて、誰がソフトウェアを構築し、誰がそれを実行するかの区別は薄れ続けるでしょう。未来は、ビジネスの理解、開発の専門知識、運用の卓越性を、ソフトウェアをデリバリーするための結束したアプローチに効果的に融合できるチームに属しています。

伝統的な開発と運用のパーティションは、他の初期のパーティショニング決定と同様に、指数関数的な結果をもたらします。この境界を不変の事実ではなく選択肢として認識する組織は、クラウドネイティブアーキテクチャの潜在能力を最大限に活用するためのより良い立場に立つでしょう。

---

## 参考文献

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

*元々はGary Y.によって[LinkedIn](https://www.linkedin.com/pulse/blurring-lines-between-development-operations-modern-cloud-gary-yang-sznde/)で公開されました*

## 関連記事

- [ソフトウェアのK-Dツリー：なぜパーティションシーケンスがシステムの複雑さを決定するのか](/articles/kd-tree-software-partition-sequence/) - 初期のパーティショニング決定がシステムの複雑さに指数関数的な影響を与える方法を探ります
- [ステートフルデプロイメントの天井を破る：DevOpsのための次元パーティショニング](/articles/stateful-deployment-dimensional-partitioning/) - 同じパーティショニング哲学がデプロイメント戦略にどのように適用されるか

</rewritten_file> 