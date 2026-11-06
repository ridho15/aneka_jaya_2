# Graph Report - SLM  (2026-11-06)

## Corpus Check
- Large corpus: 843 files · ~632,416 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3861 nodes · 13051 edges · 150 communities (139 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 50 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Inventory Ui Opnameimportform
- Inventory Inventorydocumentform Grnpostform
- Print Dotmatrix Sales
- Accounting Sdm Purchasing
- Purchasing Sdm Purchaseinvoicemodal
- Accounting Inventoryreconciliation Fixedassets
- Purchasing Validation Purchasingschema
- Ai Finance Aifinancialforecastview
- Store Sales Tests
- Tempo Store Tempoactionform
- Erp Expenses Inventory
- Audit Store Sdm
- Accounting Postinghooks Journalstore
- Inventory Service Products
- Penjualanform Forms Customernameinput
- Products Apipermissions Auth
- Reports Store Whatsapp
- Accounting Sdm Savingsmanager
- Deliveryorders Deliveryorderthermalprint Print
- Sales Products Normalizelookup
- Delivery Orders Deliveryorders
- Forms Pengeluaranform Ui
- Layout Navigation Tests
- Dashboard Summary Tests
- Inventory Service Jakarta
- Dashboard Paymentbreakdownchart Summary
- Expenses Store Pengeluaran
- Saleshistorylist Transactions Penjualan
- Akuntansi Sdm Dynamic
- Sales Reports Financialstatements
- Scripts Audit Dashboard
- Tests Test Dashboard
- Tests Visual Spec
- Scripts Seed Prisma
- Approval Store Validation
- Profit Settings Slm
- Whatsapp Whatsappclient Types
- Erpsync Salesretry Sales
- Inventory Shipmentcore Shipmentimport
- Reports Print Products
- Settings Transactionrouting Erpsync
- Integrations Mj Invoices
- Scripts Auth Gateway
- Akuntansi Dynamic Print
- Print Printpreviewpage Preview
- Masterdata Business Input
- Inventory Erpimport Math
- Sales Penjualanschema Tests
- Tempo Validation Temposchema
- Users Store Tests
- Integrations Mj Service
- Reports Financefilters Finance
- Contrast Claude Skills
- Mj Integrations Validation
- Print Dotmatrix Bak
- Auth Localsession Anikaerp
- Cctv Penjualan Reports
- Stocks Detail Tests
- Package Scripts Db
- Dummy Scripts Seed
- Validation Settingsschema Rekening
- Cctv Store Tests
- Auth Roles Erpcontractguards
- Auth Request Proxy
- Inventory Opnameimport Import
- Layout Appbrand Demologoutbutton
- Employeemanager Sdm Settings
- Package Devdependencies Types
- Jobs Cleanup Cctv
- Barang Coa Stok
- Salespayments Tests Test
- Settings Auth Session
- Tempo Tempoduesoonlist Store
- Erpmappers Booleanfrom Firstpresent
- Inventory Validation Adjustmentinput
- Sdm Savingsstore Savings
- Pagination Productreferences Tests
- Inventory Pricing Rate
- Erp Sync Erpsync
- Opencloud Storage Path
- Anikaclient Types Invoices
- Tsconfig Compileroptions Allowjs
- Erpsync Expenseretry Tests
- Cctv Cctvliveplayer Streams
- Accounting Reconciliationstore Reconciliation
- Inventory Shipmentimportform Producttable
- Products Productlist Buildstocklookup
- Tests Test Mocks
- Audit Trail Responsivefilterpanel
- Reports Customers Buildpagehref
- Package Dependencies Prisma
- Cctv Client Events
- Accounting Accountmodal Accountmanagertable
- Auth Localcredentials Tests
- Pembelian Purchasing Invoice
- Deliveryorders Deliveryorderproofuploader Photos
- Stockreleases Tests Test
- Scratch Inspect Ai
- Prisma Scripts Migrate
- Auth Login Authlandingpage
- Salescancellations Tests Test
- Stockalerts Store Types
- Reports Stockreports Stocks
- Cctv Monitoring Cctvdetectionstable
- Delivery Orders Activefilterlabels
- Docker Compose Gateway
- Docker Compose Postgres
- Erpshapeaudit Builderpshape Fieldshape
- Cctv Evidence Stream
- Cctv Labels Sync
- Openapi Docs Apidocs
- Docker Compose Db
- Docker Compose Db
- Tests Test Mjprocessingmodesservice
- Inventory Costing Valuation
- Integrations Mj Erp
- Tempo Summary Adddaystodatekey
- Scripts Smoke Auth
- Stockadjustments Stockadjustmentschema Validation
- Panduan Dynamic Faqs
- Fixedassetsview Accounting Assetrow
- Stocks Stocklist Buildquery
- E2e Package Devdependencies
- Sdm Salarystore Gaji
- Scripts Provision Integration
- Reports Stocks Buildpagehref
- Sdm Karyawan Simpanan
- Sdm Kasbon Employeeid
- Docker Compose Db
- Docker Compose Logging
- Tests Visual Read
- Docker Compose Volumes
- Docker Compose Db
- Docker Compose Slm
- Scripts Check Production
- Scripts Reconcile Delivery
- Tools Verification Adversarial
- Tests Inventoryassetaccounting Db
- Next Config Nextconfig
- Config Tailwindcss Tailwind
- Scripts Types D
- Eslint Config Next
- Mcp Command Npx
- Scripts Backup Db
- Update Sh 

## God Nodes (most connected - your core abstractions)
1. `can()` - 348 edges
2. `next` - 245 edges
3. `getCurrentUser()` - 211 edges
4. `getCurrentRole()` - 197 edges
5. `vitest` - 171 edges
6. `AppShell()` - 152 edges
7. `react` - 118 edges
8. `recordAudit()` - 116 edges
9. `Button()` - 114 edges
10. `Input()` - 102 edges

## Surprising Connections (you probably didn't know these)
- `FixedAssetsPage()` --calls--> `FixedAssetsView()`  [EXTRACTED]
  app/akuntansi/aset-tetap/page.tsx → components/accounting/FixedAssetsView.tsx
- `FixedAssetsPage()` --calls--> `AppShell()`  [EXTRACTED]
  app/akuntansi/aset-tetap/page.tsx → components/layout/AppShell.tsx
- `FixedAssetsPage()` --calls--> `getFixedAssetPolicy()`  [EXTRACTED]
  app/akuntansi/aset-tetap/page.tsx → lib/accounting/fixedAssets.ts
- `FixedAssetsPage()` --calls--> `listFixedAssets()`  [EXTRACTED]
  app/akuntansi/aset-tetap/page.tsx → lib/accounting/fixedAssets.ts
- `FixedAssetsPage()` --calls--> `can()`  [EXTRACTED]
  app/akuntansi/aset-tetap/page.tsx → lib/auth/roles.ts

## Import Cycles
- None detected.

## Communities (150 total, 11 thin omitted)

### Community 0 - "Inventory Ui Opnameimportform"
Cohesion: 0.05
Nodes (56): dynamic, InventoryProductPage(), InventoryReconciliationView(), rp(), Props, ReconciliationView(), ApprovalActionForm(), DeliveryOrderDetailView() (+48 more)

### Community 1 - "Inventory Inventorydocumentform Grnpostform"
Cohesion: 0.06
Nodes (68): AdjustmentPage(), dynamic, BarangMasukPage(), dynamic, dynamic, ImportOpnamePage(), dynamic, MutasiStokPage() (+60 more)

### Community 2 - "Print Dotmatrix Sales"
Cohesion: 0.05
Nodes (67): GET(), GET(), dynamic, ExpenseInvoicePage(), DraftPenjualanPage(), dynamic, pageHref(), rupiah() (+59 more)

### Community 3 - "Accounting Sdm Purchasing"
Cohesion: 0.06
Nodes (54): DELETE(), GET(), PUT(), GET(), POST(), POST(), GET(), GET() (+46 more)

### Community 4 - "Purchasing Sdm Purchaseinvoicemodal"
Cohesion: 0.06
Nodes (57): CurrencyRateManager(), Props, LocalAttachmentPreview(), LocalAttachmentPreviewProps, LoginForm(), GoodsReceiptModal(), InventoryLocationOption, PoItem (+49 more)

### Community 5 - "Accounting Inventoryreconciliation Fixedassets"
Cohesion: 0.06
Nodes (67): dateOrNull, PATCH(), schema, fail(), GET(), POST(), fail(), GET() (+59 more)

### Community 6 - "Purchasing Validation Purchasingschema"
Cohesion: 0.06
Nodes (53): GET(), POST(), GET(), PATCH(), GET(), POST(), TaxStatus, getLatestRate() (+45 more)

### Community 7 - "Ai Finance Aifinancialforecastview"
Cohesion: 0.05
Nodes (48): dynamic, POST(), dynamic, GET(), AiFinancialForecastPage(), dynamic, AiInventoryForecastPage(), dynamic (+40 more)

### Community 8 - "Store Sales Tests"
Cohesion: 0.07
Nodes (55): clean(), customerNameKey(), CustomerOption, rememberCustomerFromSale(), SaleCustomer, transactionDateKey(), transactionNumberFor(), snapshotDeliveryOrderShippedItems() (+47 more)

### Community 9 - "Tempo Store Tempoactionform"
Cohesion: 0.09
Nodes (54): GET(), dynamic, Info(), methodBadge(), statusBadge(), TempoDetailPage(), TempoActionForm(), rekeningForTipe() (+46 more)

### Community 10 - "Erp Expenses Inventory"
Cohesion: 0.07
Nodes (35): dynamic, GET(), dynamic, GET(), GET(), debugEnabled(), GET(), GET() (+27 more)

### Community 11 - "Audit Store Sdm"
Cohesion: 0.06
Nodes (46): AccountRow, createAccount(), deleteAccount(), STANDARD_ACCOUNTS, StandardAccountSeed, updateAccount(), appendAudit(), applyAuditFilters() (+38 more)

### Community 12 - "Accounting Postinghooks Journalstore"
Cohesion: 0.11
Nodes (41): GET(), POST(), GET(), POST(), ensureStandardAccounts(), getAccountByCode(), getAccountById(), reverseStaleCogsJournal() (+33 more)

### Community 13 - "Inventory Service Products"
Cohesion: 0.09
Nodes (40): GET, POST, PATCH, GET, POST, GET, TYPES, GET (+32 more)

### Community 14 - "Penjualanform Forms Customernameinput"
Cohesion: 0.07
Nodes (49): CustomerNameInput(), CustomerOption, allocateOrderDiscount(), buildProductOptions(), clampDiscountPercent(), CreatedSale, DependencyNotice(), DiscountInput() (+41 more)

### Community 15 - "Products Apipermissions Auth"
Cohesion: 0.08
Nodes (39): GET(), DELETE(), GET(), PUT(), GET(), numberParam(), POST(), GET() (+31 more)

### Community 16 - "Reports Store Whatsapp"
Cohesion: 0.10
Nodes (39): GET(), GET(), dynamic, ReportsPage(), rupiah(), DailyReportPrintPage(), dynamic, rupiah() (+31 more)

### Community 17 - "Accounting Sdm Savingsmanager"
Cohesion: 0.12
Nodes (36): GeneralLedgerView(), Props, JournalDetailModal(), JournalDetailRow, Props, JournalOverviewTable(), Props, JournalLineForm (+28 more)

### Community 18 - "Deliveryorders Deliveryorderthermalprint Print"
Cohesion: 0.08
Nodes (32): AlertCircleIcon(), ArrowLeftIcon(), BLUETOOTH_PRINT_SERVICES, BluetoothDevice, BluetoothIcon(), BluetoothNavigator, BluetoothRemoteGATTCharacteristic, BluetoothRemoteGATTServer (+24 more)

### Community 19 - "Sales Products Normalizelookup"
Cohesion: 0.09
Nodes (45): createOfficialProduct(), findProductIdBySku(), normalizeLookup(), numberId(), responseId(), autoCreateCustomerEnabled(), autoCustomerEmailDomain(), buildOfficialSalesPayload() (+37 more)

### Community 20 - "Delivery Orders Deliveryorders"
Cohesion: 0.09
Nodes (34): POST(), POST(), PATCH(), POST(), GET(), POST(), POST(), GET() (+26 more)

### Community 21 - "Forms Pengeluaranform Ui"
Cohesion: 0.09
Nodes (33): BarangForm(), Field(), ExpenseJournalPreview(), Props, CreatedExpense, currentMonthJakarta(), DEFAULT_COA, EmployeeOption (+25 more)

### Community 22 - "Layout Navigation Tests"
Cohesion: 0.10
Nodes (29): MobileNavigationDrawer(), NavCountBadge(), activeNavSection(), CATEGORY_ORDER, isNavLinkActive(), matchNavHref(), NAV_SECTIONS, NavCategory (+21 more)

### Community 23 - "Dashboard Summary Tests"
Cohesion: 0.08
Nodes (40): colors, AuditLog, apakahPengeluaranOperasional(), apakahPenjualanOperasional(), awalBulan(), buatPerformaBulanan, buatPetaHargaModal(), buatRincianPembayaran (+32 more)

### Community 24 - "Inventory Service Jakarta"
Cohesion: 0.14
Nodes (41): GET, JAKARTA_TIME_ZONE, InventoryError, BalanceQuery, cancelSaleStockLocal(), cancelTransfer(), createAdjustmentRecord(), createOpnameRecord() (+33 more)

### Community 25 - "Dashboard Paymentbreakdownchart Summary"
Cohesion: 0.09
Nodes (37): activeFilterLabels(), dashboardFilters(), DashboardPage(), dynamic, monthEnd(), paymentMethods, paymentPeriodFromParams(), preservedDashboardParams() (+29 more)

### Community 26 - "Expenses Store Pengeluaran"
Cohesion: 0.10
Nodes (37): Badge(), ExpenseDetailPage(), Info(), rupiah(), statusTone(), activeFilterLabels(), dynamic, filtersFromParams() (+29 more)

### Community 27 - "Saleshistorylist Transactions Penjualan"
Cohesion: 0.10
Nodes (38): activeFilterLabels(), approvalStatuses, cctvStatusLabel(), dynamic, filtersFromParams(), hasExtraFilter(), pageHref(), paymentMethods (+30 more)

### Community 28 - "Akuntansi Sdm Dynamic"
Cohesion: 0.10
Nodes (28): AkuntansiBukuBesarPage(), dynamic, AkuntansiCoaPage(), dynamic, AkuntansiJurnalPage(), dynamic, AkuntansiNeracaSaldoPage(), dynamic (+20 more)

### Community 29 - "Sales Reports Financialstatements"
Cohesion: 0.07
Nodes (28): GET(), POST(), LEDGER_JOURNAL_STATUS, GeneralLedgerResult, LedgerEntry, TrialBalanceResult, TrialBalanceRow, BalanceSheetEquity (+20 more)

### Community 30 - "Scripts Audit Dashboard"
Cohesion: 0.12
Nodes (35): addMonths(), approved(), auditErrorMessage(), auditSalesSyncSafety(), buildDashboardAuditReport(), buildMonthlyPerformance(), buildOperationalProfitSummary(), buildPaymentBreakdown() (+27 more)

### Community 31 - "Tests Test Dashboard"
Cohesion: 0.10
Nodes (26): ProfitDetailView(), rupiah(), SaleRowItem(), buildPaymentBreakdown(), DashboardProfitDetails, hitungPersentasePembayaran(), ProfitDetailSale, isProfitExpense() (+18 more)

### Community 32 - "Tests Visual Spec"
Cohesion: 0.08
Nodes (20): @playwright/test@^1.61.1, visualSessionSecret, @playwright/test, migration, envValue(), ownerSessionCookie(), envValue(), visualSessionCookie() (+12 more)

### Community 33 - "Scripts Seed Prisma"
Cohesion: 0.08
Nodes (20): checkCoreReadiness(), loadLocalEnv(), REQUIRED_ENV, result, loadEnvFiles(), prisma, hashPassword(), main() (+12 more)

### Community 34 - "Approval Store Validation"
Cohesion: 0.12
Nodes (28): POST(), reverseExpenseJournal(), createExpense(), createSdmSubledgerForExpense(), ApprovalForbiddenError, approvalIsEnabled(), ApprovalListFilter, ApprovalModule (+20 more)

### Community 35 - "Profit Settings Slm"
Cohesion: 0.09
Nodes (28): GET(), PUT(), DashboardProfitDetailPage(), dynamic, SearchParams, valueOf(), dynamic, ProfitSlmSettingsPage() (+20 more)

### Community 36 - "Whatsapp Whatsappclient Types"
Cohesion: 0.13
Nodes (28): dynamic, WhatsAppSettingsPage(), sendMetaCloudApi(), sendThirdPartyProvider(), WhatsAppMessageLog, WhatsAppProviderName, WhatsAppProviderStatus, WhatsAppRecipient (+20 more)

### Community 37 - "Erpsync Salesretry Sales"
Cohesion: 0.11
Nodes (32): decorateSalesResponse(), erpAuditResponse(), erpHttpStatus(), erpInvoiceIdentityFrom(), erpReferenceFrom(), safeErpSyncError(), sendOfficialSalesToErp(), updateOfficialSalesInErp() (+24 more)

### Community 38 - "Inventory Shipmentcore Shipmentimport"
Cohesion: 0.12
Nodes (28): maxDuration, overridesSchema, POST, hasRealName(), CATEGORY_ID, categoryFor(), categoryToIndonesian(), computeShipment() (+20 more)

### Community 39 - "Reports Print Products"
Cohesion: 0.09
Nodes (26): GET(), dynamic, FinanceReportPrintPage(), rupiah(), SearchParams, buildPageHref(), dynamic, ProductReportsPage() (+18 more)

### Community 40 - "Settings Transactionrouting Erpsync"
Cohesion: 0.13
Nodes (26): GET(), PUT(), salesTargetForType(), DEFAULT_ERP_TRANSACTION_TYPE_CODE, erpExpenseTypeCodes(), erpSalesTypeCodes(), erpTransactionTypeCodes(), expenseTargetForTypeCode() (+18 more)

### Community 41 - "Integrations Mj Invoices"
Cohesion: 0.20
Nodes (21): GET(), GET(), POST(), POST(), POST(), GET(), POST(), authenticateMjRequest() (+13 more)

### Community 42 - "Scripts Auth Gateway"
Cohesion: 0.11
Nodes (23): createAuthGatewayServer(), decodeSession(), encodeSession(), escapeHtml(), handleLogin(), handleLogout(), HOP_BY_HOP_HEADERS, htmlPage() (+15 more)

### Community 43 - "Akuntansi Dynamic Print"
Cohesion: 0.10
Nodes (21): dynamic, FixedAssetsPage(), AkuntansiKursPage(), dynamic, dynamic, InventoryPolicyPage(), AkuntansiRekonsiliasiPage(), dynamic (+13 more)

### Community 44 - "Print Printpreviewpage Preview"
Cohesion: 0.15
Nodes (22): dynamic, MjInvoicePrintPage(), dynamic, SalesContinuousPrintPage(), dynamic, TempoPrintPage(), ContinuousPaperPreview(), DEFAULT_PRINT_SETTINGS (+14 more)

### Community 45 - "Masterdata Business Input"
Cohesion: 0.14
Nodes (23): dynamic, InputPengeluaranPage(), dynamic, EditPenjualanPage(), dynamic, InputPenjualanPage(), dynamic, RekeningPage() (+15 more)

### Community 46 - "Inventory Erpimport Math"
Cohesion: 0.13
Nodes (23): maxDuration, POST(), GET, Aggregated, aggregateErpStocks(), ErpImportSummary, importInventoryFromErp(), intId() (+15 more)

### Community 47 - "Sales Penjualanschema Tests"
Cohesion: 0.12
Nodes (21): POST(), createSale(), MasterDataError, resolveSalesRekening(), jakartaTimestampFromLocal(), acquireSalesLock(), areItemsIdentical(), findExistingSaleByRequestId() (+13 more)

### Community 48 - "Tempo Validation Temposchema"
Cohesion: 0.10
Nodes (15): POST(), POST(), POST(), rupiah(), SalesReturnListPage(), statusBadge(), dynamic, Props (+7 more)

### Community 49 - "Users Store Tests"
Cohesion: 0.15
Nodes (23): PUT(), userErrorResponse(), GET(), POST(), userErrorResponse(), dynamic, UsersPage(), assertCanManageUsers() (+15 more)

### Community 50 - "Integrations Mj Service"
Cohesion: 0.19
Nodes (29): cancelMjErpSales(), createMjErpInvoice(), createMjPayment(), deterministicReference(), accountReference(), attempt(), cancelMjInvoice(), createLocalInvoice() (+21 more)

### Community 51 - "Reports Financefilters Finance"
Cohesion: 0.16
Nodes (23): dynamic, FinanceReportsPage(), Pagination(), rekeningLabel(), rupiah(), tempoStatusBadge(), ExpenseFilterCriteria, filterApprovedExpenses() (+15 more)

### Community 52 - "Contrast Claude Skills"
Cohesion: 0.12
Nodes (18): contrast_ratio(), linearize(), luminance(), main(), parse_hex(), parse_pairing(), parse_reference_rows(), reference_doc_path() (+10 more)

### Community 53 - "Mj Integrations Validation"
Cohesion: 0.08
Nodes (26): ajAccountSchema, ajAlreadyProcessedSchema, ajItemSchema, common, customerSchema, localAccountSchema, localItemSchema, MJ_PROCESSING_MODES (+18 more)

### Community 54 - "Print Dotmatrix Bak"
Cohesion: 0.18
Nodes (25): amountLine(), center(), column(), DOT_MATRIX_WIDTH, DotMatrixItemLayout, formatExpenseDotMatrix(), formatSaleDotMatrix(), formatTempoPaymentDotMatrix() (+17 more)

### Community 55 - "Auth Localsession Anikaerp"
Cohesion: 0.14
Nodes (21): POST(), ANIKA_ERP_TOKEN_COOKIE, AnikaVerifyUserResponse, clearAnikaErpTokenCookie(), loginUrl(), loginWithAnikaErp(), roleFromAnika(), setAnikaErpTokenCookie() (+13 more)

### Community 56 - "Cctv Penjualan Reports"
Cohesion: 0.15
Nodes (21): Badge(), Info(), rupiah(), SalesDetailPage(), statusTone(), stockReleaseBadge(), CctvReportsMultiTabPage(), dynamic (+13 more)

### Community 57 - "Stocks Detail Tests"
Cohesion: 0.16
Nodes (23): clampPage(), clampPageSize(), filterStocks(), getStockDetail(), listLocalStocks(), listStocks(), listStocksPage(), matchesAny() (+15 more)

### Community 58 - "Package Scripts Db"
Cohesion: 0.07
Nodes (27): scripts, app:check-core-readiness, audit:dashboard, auth:gateway, auth:hash-password, build, db:migrate:deploy, db:migrate:json (+19 more)

### Community 59 - "Dummy Scripts Seed"
Cohesion: 0.09
Nodes (21): customers, cwd, DUMMY_TIPE, dummyRows, existingRows, from, jakartaDateKey(), locations (+13 more)

### Community 60 - "Validation Settingsschema Rekening"
Cohesion: 0.14
Nodes (21): GET(), POST(), PUT(), validateTipeIds(), validBanks, POST(), PUT(), POST() (+13 more)

### Community 61 - "Cctv Store Tests"
Cohesion: 0.18
Nodes (21): NAV_LINKS, CctvAnomaliesFilter, CctvOutboundReportFilter, getActivityDateCondition(), getCctvAnomaliesReport(), getCctvCamerasReport(), getCctvDashboardSummary(), getCctvDetectionForSales() (+13 more)

### Community 62 - "Auth Roles Erpcontractguards"
Cohesion: 0.13
Nodes (15): POST(), POST(), Home(), ERP_CONTRACT_PENDING_CODE, PENDING_ERP_CONTRACTS, PendingErpContractFeature, pendingErpContractResponse(), ALL_PERMISSIONS (+7 more)

### Community 63 - "Auth Request Proxy"
Cohesion: 0.15
Nodes (20): AuthEnv, AuthProvider, CookieReader, hasTrustedHeaderAccess(), isProductionAuthRuntime(), readCookie(), RequestLike, resolveDemoUser() (+12 more)

### Community 64 - "Inventory Opnameimport Import"
Cohesion: 0.13
Nodes (20): maxDuration, POST, postInventoryDocumentJournalSafely(), DEFAULT_UNIT, batchKey(), cellValue(), HEADER_ALIASES, importOpnameWorkbook() (+12 more)

### Community 65 - "Layout Appbrand Demologoutbutton"
Cohesion: 0.17
Nodes (14): metadata, RootLayout(), DemoLogoutButton(), Header(), initials(), ToastProvider(), currentHref(), TopLoadingBar() (+6 more)

### Community 66 - "Employeemanager Sdm Settings"
Cohesion: 0.12
Nodes (18): COMMON_DEPARTMENTS, EmployeeFormData, EmployeeManager(), emptyFormData, OrgTreeNodeView(), Props, PaymentListSettings(), Props (+10 more)

### Community 67 - "Package Devdependencies Types"
Cohesion: 0.11
Nodes (23): devDependencies, autoprefixer@^10.4.20, eslint@^9.39.4, postcss@8.5.15, @types/node@^22.9.0, @types/qrcode@^1.5.6, @types/react@^18.3.12, @types/react-dom@^18.3.1 (+15 more)

### Community 68 - "Jobs Cleanup Cctv"
Cohesion: 0.20
Nodes (14): POST(), GET(), POST(), POST(), POST(), CctvCleanupOptions, CctvCleanupResult, cleanupCctvStorage() (+6 more)

### Community 69 - "Barang Coa Stok"
Cohesion: 0.13
Nodes (17): dynamic, EditBarangPage(), dynamic, EditPengeluaranPage(), DetailParams, DetailSearchParams, dynamic, formatNumber() (+9 more)

### Community 70 - "Salespayments Tests Test"
Cohesion: 0.23
Nodes (21): asRecord(), buildSalesPaymentPayload(), createErpSalesPayment(), dataRows(), ErpInvoiceLookup, ErpInvoicePaymentStatus, findErpInvoiceByNumber(), findErpInvoiceForCustomerPayment() (+13 more)

### Community 71 - "Settings Auth Session"
Cohesion: 0.18
Nodes (13): POST(), POST(), NoAccessPage(), dynamic, Row(), SettingsCard(), SettingsPage(), LogoutButton() (+5 more)

### Community 72 - "Tempo Tempoduesoonlist Store"
Cohesion: 0.19
Nodes (18): activeFilterLabels(), dynamic, filterHref(), filtersFromParams(), pageHref(), SearchParams, statusBadgeClass(), TempoPage() (+10 more)

### Community 73 - "Erpmappers Booleanfrom Firstpresent"
Cohesion: 0.26
Nodes (20): booleanFrom(), firstPresent(), idNumberFrom(), isRecord(), NAME_KEYS, nestedRecord(), numberFrom(), productBrandName() (+12 more)

### Community 74 - "Inventory Validation Adjustmentinput"
Cohesion: 0.09
Nodes (18): AdjustmentInput, dateString, itemNotes, koliFields, LocationInput, locationSchema, locationUpdateSchema, OpnameInput (+10 more)

### Community 75 - "Sdm Savingsstore Savings"
Cohesion: 0.19
Nodes (15): GET(), POST(), GET(), POST(), depositSavings(), DepositSavingsInput, generateSavingsAccountNumber(), getOrCreateSavingsAccount() (+7 more)

### Community 76 - "Pagination Productreferences Tests"
Cohesion: 0.18
Nodes (18): ErpPage, ErpPageMeta, listErpPage(), listErpPaginated(), PaginatedBody, pathWithQuery(), positiveInteger(), rowsFrom() (+10 more)

### Community 77 - "Inventory Pricing Rate"
Cohesion: 0.20
Nodes (17): GET, PUT, GET, PUT, applyRmbCost(), CBM_RATE_KEY, costFromRmb(), CostInputs (+9 more)

### Community 78 - "Erp Sync Erpsync"
Cohesion: 0.19
Nodes (15): erpConfigStatus(), ErpSyncPage(), pageHref(), Pagination(), rupiah(), SearchParams, toPage(), valueOf() (+7 more)

### Community 79 - "Opencloud Storage Path"
Cohesion: 0.17
Nodes (13): GET(), MIME_MAP, getOpenCloudStatus(), isOpenCloudConfigured(), ALLOWED_FILE_TYPES, EXTENSION_MAP, IMAGE_TYPES, MAX_FILE_SIZE (+5 more)

### Community 80 - "Anikaclient Types Invoices"
Cohesion: 0.20
Nodes (16): anikaRequest(), asRecord(), correlationIdFromInit(), firstString(), logSafeErpError(), mapErpError(), safeDebugEnabled(), SafeErpError (+8 more)

### Community 81 - "Tsconfig Compileroptions Allowjs"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 82 - "Erpsync Expenseretry Tests"
Cohesion: 0.20
Nodes (16): POST(), buildExpenseNeoCommand(), buildRetryCommand(), cleanPage(), cleanPageSize(), correlationIdFromFailure(), ErpSyncExpenseItem, expenseDelegate() (+8 more)

### Community 83 - "Cctv Cctvliveplayer Streams"
Cohesion: 0.23
Nodes (14): CameraCell(), CameraCellProps, CctvLivePlayer(), CctvLivePlayerProps, CctvDashboardSummaryData, CctvDashboardWidget(), CctvThumbnail(), CctvCameraStatus (+6 more)

### Community 84 - "Accounting Reconciliationstore Reconciliation"
Cohesion: 0.21
Nodes (15): GET(), POST(), getGeneralLedger(), expenseDebitAccountFor(), postExpenseJournal(), getAccountingReconciliationReport(), LegacyExpenseAuditItem, listUnpostedExpenses() (+7 more)

### Community 85 - "Inventory Shipmentimportform Producttable"
Cohesion: 0.17
Nodes (12): fmt(), MarkupCell(), ProductEditor(), ProductRow, ProductTable(), num(), Preview, rp() (+4 more)

### Community 86 - "Products Productlist Buildstocklookup"
Cohesion: 0.20
Nodes (16): buildStockLookup(), formatMoney(), formatNumber(), locationSummary(), ProductList(), productWarnings(), qualityWarning(), rupiah() (+8 more)

### Community 87 - "Tests Test Mocks"
Cohesion: 0.16
Nodes (7): react-dom, vitest, mocks, mocks, mocks, sale, mocks

### Community 88 - "Audit Trail Responsivefilterpanel"
Cohesion: 0.18
Nodes (14): ACTIONS, activeFilterLabels(), AuditTrailPage(), dynamic, ENTITY_TYPES, pageHref(), Props, valueOf() (+6 more)

### Community 89 - "Reports Customers Buildpagehref"
Cohesion: 0.18
Nodes (14): buildPageHref(), CustomerReportsPage(), dynamic, rupiah(), SearchParams, cleanString(), CustomerReportOptions, CustomerReportResult (+6 more)

### Community 90 - "Package Dependencies Prisma"
Cohesion: 0.12
Nodes (17): dependencies, exceljs@^4.4.0, hls.js@^1.7.3, @hookform/resolvers@^3.9.1, html-to-image@^1.11.13, next@^16.2.9, prisma@^6.19.3, @prisma/client@^6.19.3 (+9 more)

### Community 91 - "Cctv Client Events"
Cohesion: 0.29
Nodes (10): CctvWebhookPayload, POST(), verifyToken(), cctvFetch(), CctvInvoiceResponse, CctvPackingSummaryResponse, fetchSnapshotCaptureDate(), getCctvInvoiceStatus() (+2 more)

### Community 92 - "Accounting Accountmodal Accountmanagertable"
Cohesion: 0.18
Nodes (13): AccountManagerTable(), Props, AccountForm(), AccountModal(), AccountRecord, accountSavePayload(), Category, CATEGORY_LABEL (+5 more)

### Community 93 - "Auth Localcredentials Tests"
Cohesion: 0.25
Nodes (11): POST(), findUserByIdentifier(), loginWithPassword(), normalizeIdentifier(), normalizePassword(), recordLoginAudit(), hashPassword(), verifyPassword() (+3 more)

### Community 94 - "Pembelian Purchasing Invoice"
Cohesion: 0.20
Nodes (12): dynamic, PembelianInvoicePage(), dynamic, PembelianPembayaranPage(), dynamic, PembelianPesananPage(), PurchaseInvoiceData, PurchaseOrderData (+4 more)

### Community 95 - "Deliveryorders Deliveryorderproofuploader Photos"
Cohesion: 0.30
Nodes (9): DeliveryOrderProofUploader(), DeliveryOrderProofUploaderProps, getFirstReceiptPhoto(), parseReceiptPhotos(), sanitizeReceiptPhotoUrl(), serializeReceiptPhotos(), compressImage(), ImageCompressionOptions (+1 more)

### Community 96 - "Stockreleases Tests Test"
Cohesion: 0.24
Nodes (13): buildStockReleasePayload(), cancelStockRelease(), localFailure(), nextRevisionReference(), numberId(), ReleaseItemInput, releaseReferenceFor(), releaseSaleStock() (+5 more)

### Community 97 - "Scratch Inspect Ai"
Cohesion: 0.14
Nodes (10): prisma, { PrismaClient }, require, jakartaDateKey(), main(), prisma, { PrismaClient }, require (+2 more)

### Community 98 - "Prisma Scripts Migrate"
Cohesion: 0.39
Nodes (14): assertReady(), emptySummary(), main(), migrateApprovalRequests(), migrateAuditLogs(), migrateSalesRecords(), migrateStockAlertLogs(), migrateTempoPayments() (+6 more)

### Community 99 - "Auth Login Authlandingpage"
Cohesion: 0.27
Nodes (9): dynamic, LoginPage(), AuthLandingPage(), IconName, ModuleIcon(), LoginPageShell(), authenticatedLoginTarget(), shouldRedirectAuthenticatedLogin() (+1 more)

### Community 100 - "Salescancellations Tests Test"
Cohesion: 0.23
Nodes (12): asRecord(), buildSalesCancellationPayload(), cancelErpSales(), cancellationResultFrom(), firstString(), numberId(), RequestedBy, safeSalesCancellationError() (+4 more)

### Community 101 - "Stockalerts Store Types"
Cohesion: 0.30
Nodes (8): checkStockMinimumAlert(), listStockAlertLogs(), mapPrismaStockAlertLog(), StockAlertLog, Product, ProductStockSummary, StockItem, mocks

### Community 102 - "Reports Stockreports Stocks"
Cohesion: 0.27
Nodes (8): GET, GET(), listBalances(), compareStockItems(), getStockInventoryReport(), StockReportFilter, StockReportResult, stockStatus()

### Community 103 - "Cctv Monitoring Cctvdetectionstable"
Cohesion: 0.26
Nodes (10): activeFilterLabels(), CctvMonitoringPage(), dynamic, pageHref(), Props, valueOf(), CctvDetectionsTable(), DetectionItem (+2 more)

### Community 104 - "Delivery Orders Activefilterlabels"
Cohesion: 0.28
Nodes (12): activeFilterLabels(), DeliveryOrdersPage(), dynamic, filtersFromParams(), officerFilterLabel(), packingStatusLabel(), pageHref(), SearchParams (+4 more)

### Community 105 - "Docker Compose Gateway"
Cohesion: 0.15
Nodes (13): slm-app, AUTH_GATEWAY_APP_ORIGIN, AUTH_GATEWAY_HOST, AUTH_GATEWAY_PORT, slm-gateway, condition, command, container_name (+5 more)

### Community 106 - "Docker Compose Postgres"
Cohesion: 0.15
Nodes (13): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, interval, retries, test, timeout, slm-postgres (+5 more)

### Community 107 - "Erpshapeaudit Builderpshape Fieldshape"
Cohesion: 0.32
Nodes (11): buildErpShape(), FieldShape, inspectRows(), inspectValue(), isRecord(), mergeSample(), mergeShape(), rowsFromErpPayload() (+3 more)

### Community 108 - "Cctv Evidence Stream"
Cohesion: 0.24
Nodes (8): dynamic, GET(), isAllowedHost(), dynamic, GET(), CCTV_BASE_URL, CCTV_TOKEN, sanitizeLocalPhotoUrl

### Community 109 - "Cctv Labels Sync"
Cohesion: 0.29
Nodes (8): POST(), verifyToken(), ALLOWED_MIME_TYPES, isValidImageBuffer(), POST(), saveBase64Screenshot(), saveScreenshotFile(), verifyToken()

### Community 110 - "Openapi Docs Apidocs"
Cohesion: 0.24
Nodes (8): assertOwner(), GET(), openApiPath, readOpenApiDocument(), readOpenApiYaml(), require, yaml, walkRoutes()

### Community 111 - "Docker Compose Db"
Cohesion: 0.17
Nodes (12): environment, environment, build, command, env_file, environment, image, profiles (+4 more)

### Community 112 - "Docker Compose Db"
Cohesion: 0.17
Nodes (12): depends_on, depends_on, build, command, depends_on, env_file, image, profiles (+4 more)

### Community 113 - "Tests Test Mjprocessingmodesservice"
Cohesion: 0.24
Nodes (8): canonical(), immutablePayloadHash(), sha256(), candidate(), mocks, base, mocks, principal

### Community 114 - "Inventory Costing Valuation"
Cohesion: 0.27
Nodes (11): ensureOpeningLayer(), layerCount(), NO_VALUATION, num(), OPENING_ON_FIRST, productHasLayers(), r2(), r4() (+3 more)

### Community 115 - "Integrations Mj Erp"
Cohesion: 0.31
Nodes (9): GET(), createMjErpCustomer(), findMjErpCustomer(), listMjErpCustomers(), MjErpCustomer, numberId(), record(), releaseMjStock() (+1 more)

### Community 116 - "Tempo Summary Adddaystodatekey"
Cohesion: 0.35
Nodes (9): addDaysToDateKey(), calculateTempoMetricsSummary(), isOpenTempoStatus(), OpenTempoStatus, summarizeOpenTempo(), TempoMetricRowInput, TempoMetricsSummary, TempoSummaryInput (+1 more)

### Community 117 - "Scripts Smoke Auth"
Cohesion: 0.33
Nodes (8): appUrl(), assertRequiredEnv(), fetchManual(), isRedirectTo(), REQUIRED, runAuthSmoke(), trimTrailingSlash(), env

### Community 118 - "Stockadjustments Stockadjustmentschema Validation"
Cohesion: 0.36
Nodes (6): POST(), createStockAdjustment(), toErpPayload(), StockAdjustmentInput, stockAdjustmentSchema, mocks

### Community 119 - "Panduan Dynamic Faqs"
Cohesion: 0.24
Nodes (9): dynamic, faqs, GuideSection, PanduanPage(), roleGuides, sections, sectionVisible(), slug() (+1 more)

### Community 120 - "Fixedassetsview Accounting Assetrow"
Cohesion: 0.31
Nodes (7): AssetRow(), day(), FixedAssetItem, FixedAssetPolicyView, FixedAssetsView(), rp(), STATUS

### Community 121 - "Stocks Stocklist Buildquery"
Cohesion: 0.36
Nodes (9): buildQuery(), formatNumber(), pageHref(), StockFilters, StockList(), timeLabel(), warningBadge(), StockPageMeta (+1 more)

### Community 122 - "E2e Package Devdependencies"
Cohesion: 0.24
Nodes (6): @ai-sdk/anthropic@^4.0.85, e2e@^0.21.2, @e2e-dev/web@^0.15.2, @ai-sdk/anthropic, e2e, @e2e-dev/web

### Community 123 - "Sdm Salarystore Gaji"
Cohesion: 0.39
Nodes (7): dynamic, SdmGajiPage(), getEmployeeSalaryHistory(), getSalarySummary(), listSalaryPayments(), SalaryPaymentRow, SalarySummary

### Community 124 - "Scripts Provision Integration"
Cohesion: 0.22
Nodes (8): args, code, environment, name, prefix, prisma, secret, tokenHash

### Community 125 - "Reports Stocks Buildpagehref"
Cohesion: 0.43
Nodes (7): buildPageHref(), compactRupiah(), dynamic, rupiah(), SearchParams, StockReportsPage(), stockViewType

### Community 126 - "Sdm Karyawan Simpanan"
Cohesion: 0.36
Nodes (6): dynamic, SdmKaryawanPage(), dynamic, SavingsPage(), getOrganizationTree(), listEmployees()

### Community 127 - "Sdm Kasbon Employeeid"
Cohesion: 0.36
Nodes (6): dynamic, SdmEmployeeKasbonSubledgerPage(), dynamic, SdmUangMukaPage(), getEmployeeLedger(), listEmployeeLoans()

### Community 128 - "Docker Compose Db"
Cohesion: 0.25
Nodes (8): build, command, depends_on, env_file, image, profiles, volumes, db-import

### Community 129 - "Docker Compose Logging"
Cohesion: 0.36
Nodes (8): driver, options, max-file, max-size, logging, logging, logging, options

### Community 130 - "Tests Visual Read"
Cohesion: 0.29
Nodes (4): envValue(), Finding, ownerSessionCookie(), routes

### Community 131 - "Docker Compose Volumes"
Cohesion: 0.29
Nodes (6): services, volumes, slm_data, slm_postgres, x-logging, driver

### Community 132 - "Docker Compose Db"
Cohesion: 0.29
Nodes (7): build, command, env_file, image, profiles, volumes, db-migrate

### Community 133 - "Docker Compose Slm"
Cohesion: 0.29
Nodes (7): slm-app, build, container_name, env_file, expose, image, volumes

### Community 134 - "Scripts Check Production"
Cohesion: 0.47
Nodes (4): assertProductionEnv(), REQUIRED, validateProductionEnv(), validEnv

### Community 135 - "Scripts Reconcile Delivery"
Cohesion: 0.53
Nodes (5): generateDoNumber(), getProductName(), prisma, readJsonSales(), reconcileDeliveryOrders()

### Community 136 - "Tools Verification Adversarial"
Cohesion: 0.40
Nodes (5): main(), prisma, record(), results, TestResult

### Community 139 - "Config Tailwindcss Tailwind"
Cohesion: 0.50
Nodes (3): tailwindcss@^3.4.15, tailwindcss, config

### Community 140 - "Scripts Types D"
Cohesion: 0.50
Nodes (3): @/scripts/check-production-env.mjs, @/scripts/smoke-auth.mjs, SmokeEnv

## Knowledge Gaps
- **1 isolated node(s):** `npx`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 1002 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Tempo Validation Temposchema` to `Inventory Ui Opnameimportform`, `Inventory Inventorydocumentform Grnpostform`, `Print Dotmatrix Sales`, `Accounting Sdm Purchasing`, `Purchasing Sdm Purchaseinvoicemodal`, `Accounting Inventoryreconciliation Fixedassets`, `Purchasing Validation Purchasingschema`, `Ai Finance Aifinancialforecastview`, `Tempo Store Tempoactionform`, `Erp Expenses Inventory`, `Audit Store Sdm`, `Accounting Postinghooks Journalstore`, `Inventory Service Products`, `Penjualanform Forms Customernameinput`, `Products Apipermissions Auth`, `Reports Store Whatsapp`, `Accounting Sdm Savingsmanager`, `Deliveryorders Deliveryorderthermalprint Print`, `Delivery Orders Deliveryorders`, `Forms Pengeluaranform Ui`, `Layout Navigation Tests`, `Dashboard Paymentbreakdownchart Summary`, `Expenses Store Pengeluaran`, `Saleshistorylist Transactions Penjualan`, `Akuntansi Sdm Dynamic`, `Sales Reports Financialstatements`, `Tests Test Dashboard`, `Approval Store Validation`, `Profit Settings Slm`, `Whatsapp Whatsappclient Types`, `Reports Print Products`, `Settings Transactionrouting Erpsync`, `Akuntansi Dynamic Print`, `Print Printpreviewpage Preview`, `Masterdata Business Input`, `Inventory Erpimport Math`, `Sales Penjualanschema Tests`, `Users Store Tests`, `Reports Financefilters Finance`, `Auth Localsession Anikaerp`, `Cctv Penjualan Reports`, `Validation Settingsschema Rekening`, `Auth Roles Erpcontractguards`, `Auth Request Proxy`, `Layout Appbrand Demologoutbutton`, `Package Devdependencies Types`, `Jobs Cleanup Cctv`, `Barang Coa Stok`, `Settings Auth Session`, `Tempo Tempoduesoonlist Store`, `Sdm Savingsstore Savings`, `Erp Sync Erpsync`, `Opencloud Storage Path`, `Erpsync Expenseretry Tests`, `Cctv Cctvliveplayer Streams`, `Accounting Reconciliationstore Reconciliation`, `Inventory Shipmentimportform Producttable`, `Products Productlist Buildstocklookup`, `Audit Trail Responsivefilterpanel`, `Reports Customers Buildpagehref`, `Package Dependencies Prisma`, `Cctv Client Events`, `Accounting Accountmodal Accountmanagertable`, `Auth Localcredentials Tests`, `Auth Login Authlandingpage`, `Cctv Monitoring Cctvdetectionstable`, `Delivery Orders Activefilterlabels`, `Cctv Evidence Stream`, `Cctv Labels Sync`, `Openapi Docs Apidocs`, `Stockadjustments Stockadjustmentschema Validation`, `Panduan Dynamic Faqs`, `Fixedassetsview Accounting Assetrow`, `Stocks Stocklist Buildquery`, `Reports Stocks Buildpagehref`, `Sdm Kasbon Employeeid`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **What connects `npx` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Inventory Ui Opnameimportform` be split into smaller, more focused modules?**
  _Cohesion score 0.05347985347985348 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Tests Test Mocks` to `Inventory Ui Opnameimportform`, `Inventory Inventorydocumentform Grnpostform`, `Print Dotmatrix Sales`, `Accounting Sdm Purchasing`, `Accounting Inventoryreconciliation Fixedassets`, `Purchasing Validation Purchasingschema`, `Ai Finance Aifinancialforecastview`, `Store Sales Tests`, `Tempo Store Tempoactionform`, `Erp Expenses Inventory`, `Audit Store Sdm`, `Accounting Postinghooks Journalstore`, `Penjualanform Forms Customernameinput`, `Products Apipermissions Auth`, `Reports Store Whatsapp`, `Deliveryorders Deliveryorderthermalprint Print`, `Delivery Orders Deliveryorders`, `Forms Pengeluaranform Ui`, `Layout Navigation Tests`, `Dashboard Summary Tests`, `Dashboard Paymentbreakdownchart Summary`, `Akuntansi Sdm Dynamic`, `Sales Reports Financialstatements`, `Scripts Audit Dashboard`, `Tests Test Dashboard`, `Tests Visual Spec`, `Scripts Seed Prisma`, `Approval Store Validation`, `Profit Settings Slm`, `Whatsapp Whatsappclient Types`, `Erpsync Salesretry Sales`, `Inventory Shipmentcore Shipmentimport`, `Reports Print Products`, `Settings Transactionrouting Erpsync`, `Integrations Mj Invoices`, `Scripts Auth Gateway`, `Akuntansi Dynamic Print`, `Print Printpreviewpage Preview`, `Masterdata Business Input`, `Inventory Erpimport Math`, `Sales Penjualanschema Tests`, `Tempo Validation Temposchema`, `Users Store Tests`, `Reports Financefilters Finance`, `Mj Integrations Validation`, `Auth Localsession Anikaerp`, `Cctv Penjualan Reports`, `Stocks Detail Tests`, `Cctv Store Tests`, `Auth Roles Erpcontractguards`, `Auth Request Proxy`, `Inventory Opnameimport Import`, `Layout Appbrand Demologoutbutton`, `Employeemanager Sdm Settings`, `Package Devdependencies Types`, `Jobs Cleanup Cctv`, `Barang Coa Stok`, `Salespayments Tests Test`, `Settings Auth Session`, `Tempo Tempoduesoonlist Store`, `Erpmappers Booleanfrom Firstpresent`, `Sdm Savingsstore Savings`, `Pagination Productreferences Tests`, `Erp Sync Erpsync`, `Opencloud Storage Path`, `Anikaclient Types Invoices`, `Erpsync Expenseretry Tests`, `Cctv Cctvliveplayer Streams`, `Accounting Reconciliationstore Reconciliation`, `Products Productlist Buildstocklookup`, `Audit Trail Responsivefilterpanel`, `Reports Customers Buildpagehref`, `Cctv Client Events`, `Accounting Accountmodal Accountmanagertable`, `Auth Localcredentials Tests`, `Deliveryorders Deliveryorderproofuploader Photos`, `Stockreleases Tests Test`, `Scratch Inspect Ai`, `Auth Login Authlandingpage`, `Salescancellations Tests Test`, `Stockalerts Store Types`, `Reports Stockreports Stocks`, `Erpshapeaudit Builderpshape Fieldshape`, `Cctv Evidence Stream`, `Cctv Labels Sync`, `Openapi Docs Apidocs`, `Tests Test Mjprocessingmodesservice`, `Tempo Summary Adddaystodatekey`, `Scripts Smoke Auth`, `Stockadjustments Stockadjustmentschema Validation`, `Scripts Check Production`, `Tests Inventoryassetaccounting Db`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Should `Inventory Inventorydocumentform Grnpostform` be split into smaller, more focused modules?**
  _Cohesion score 0.06073871409028728 - nodes in this community are weakly interconnected._
- **Why does `can()` connect `Accounting Sdm Purchasing` to `Inventory Ui Opnameimportform`, `Inventory Inventorydocumentform Grnpostform`, `Print Dotmatrix Sales`, `Accounting Inventoryreconciliation Fixedassets`, `Purchasing Validation Purchasingschema`, `Tempo Store Tempoactionform`, `Erp Expenses Inventory`, `Accounting Postinghooks Journalstore`, `Inventory Service Products`, `Products Apipermissions Auth`, `Reports Store Whatsapp`, `Delivery Orders Deliveryorders`, `Layout Navigation Tests`, `Dashboard Paymentbreakdownchart Summary`, `Expenses Store Pengeluaran`, `Saleshistorylist Transactions Penjualan`, `Akuntansi Sdm Dynamic`, `Sales Reports Financialstatements`, `Approval Store Validation`, `Profit Settings Slm`, `Whatsapp Whatsappclient Types`, `Reports Print Products`, `Settings Transactionrouting Erpsync`, `Akuntansi Dynamic Print`, `Masterdata Business Input`, `Sales Penjualanschema Tests`, `Tempo Validation Temposchema`, `Users Store Tests`, `Reports Financefilters Finance`, `Cctv Penjualan Reports`, `Validation Settingsschema Rekening`, `Auth Roles Erpcontractguards`, `Auth Request Proxy`, `Barang Coa Stok`, `Settings Auth Session`, `Tempo Tempoduesoonlist Store`, `Sdm Savingsstore Savings`, `Erp Sync Erpsync`, `Accounting Reconciliationstore Reconciliation`, `Audit Trail Responsivefilterpanel`, `Reports Customers Buildpagehref`, `Cctv Client Events`, `Pembelian Purchasing Invoice`, `Reports Stockreports Stocks`, `Cctv Monitoring Cctvdetectionstable`, `Delivery Orders Activefilterlabels`, `Stockadjustments Stockadjustmentschema Validation`, `Panduan Dynamic Faqs`, `Reports Stocks Buildpagehref`, `Sdm Karyawan Simpanan`, `Sdm Kasbon Employeeid`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Should `Print Dotmatrix Sales` be split into smaller, more focused modules?**
  _Cohesion score 0.05434173669467787 - nodes in this community are weakly interconnected._