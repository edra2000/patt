class RealPatternDetector {
    constructor() {
        this.cryptoData = new Map();
        this.patterns = this.initializePatterns();
        this.init();
    }

    initializePatterns() {
        return {
            'double-bottom': {
                name: 'القاع الثنائي',
                level: 'مبتدئ',
                description: 'نموذج انعكاسي صاعد يتشكل بعد اتجاه هابط، يتكون من قاعين متساويين تقريباً مع قمة بينهما.',
                type: 'انعكاسي صاعد'
            },
            'head-shoulders': {
                name: 'الرأس والكتفين',
                level: 'مبتدئ',
                description: 'نموذج انعكاسي هابط يتكون من ثلاث قمم، الوسطى أعلى من الجانبيتين.',
                type: 'انعكاسي هابط'
            },
            'ascending-triangle': {
                name: 'المثلث الصاعد',
                level: 'مبتدئ',
                description: 'نموذج صاعد يتكون من مقاومة أفقية وخط دعم صاعد.',
                type: 'صاعد'
            },
            'descending-triangle': {
                name: 'المثلث الهابط',
                level: 'مبتدئ',
                description: 'نموذج هابط يتكون من دعم أفقي وخط مقاومة هابط.',
                type: 'هابط'
            },
            'symmetrical-triangle': {
                name: 'المثلث المتماثل',
                level: 'مبتدئ',
                description: 'نموذج استمراري يتشكل من خطي اتجاه متقاربين.',
                type: 'استمراري'
            }
        };
    }

    async init() {
        this.showLoading(true);
        await this.fetchAndAnalyzeData();
        this.setupEventListeners();
        this.showLoading(false);
        this.startRealTimeUpdates();
    }

    async fetchAndAnalyzeData() {
        try {
            // جلب قائمة العملات
            const tickerResponse = await fetch('https://api.binance.com/api/v3/ticker/24hr');
            const tickerData = await tickerResponse.json();
            
            // فلترة العملات
            const stableCoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'PAX', 'USDP'];
            const filteredCoins = tickerData.filter(coin => {
                return coin.symbol.endsWith('USDT') && 
                       !stableCoins.some(stable => coin.symbol.startsWith(stable)) &&
                       parseFloat(coin.quoteVolume) > 5000000; // حجم تداول أكبر من 5 مليون
            }).slice(0, 40); // أفضل 40 عملة

            // تحليل كل عملة
            for (const coin of filteredCoins) {
                const analysis = await this.analyzeRealPattern(coin.symbol);
                if (analysis.patternDetected) {
                    const processedCoin = this.processCoinWithRealData(coin, analysis);
                    this.cryptoData.set(coin.symbol, processedCoin);
                }
            }

            this.renderCards();
        } catch (error) {
            console.error('خطأ في جلب البيانات:', error);
            this.showError('فشل في جلب البيانات من Binance');
        }
    }

    async analyzeRealPattern(symbol) {
        try {
            // جلب البيانات التاريخية (200 شمعة، إطار ساعة)
            const candlesResponse = await fetch(
                `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=200`
            );
            const candlesData = await candlesResponse.json();
            
            const candles = candlesData.map(candle => ({
                timestamp: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));

            // تحليل الأنماط الحقيقي
            const patterns = [
                this.detectDoubleBottom(candles),
                this.detectHeadAndShoulders(candles),
                this.detectTriangles(candles)
            ].filter(p => p.detected);

            if (patterns.length > 0) {
                // اختيار النمط الأقوى
                const strongestPattern = patterns.reduce((prev, current) => 
                    current.confidence > prev.confidence ? current : prev
                );

                return {
                    patternDetected: true,
                    pattern: strongestPattern,
                    candles: candles
                };
            }

            return { patternDetected: false };

        } catch (error) {
            console.error(`خطأ في تحليل ${symbol}:`, error);
            return { patternDetected: false };
        }
    }

    detectDoubleBottom(candles) {
        if (candles.length < 50) return { detected: false };

        const lows = this.findLocalLows(candles, 10);
        
        for (let i = 0; i < lows.length - 1; i++) {
            for (let j = i + 1; j < lows.length; j++) {
                const firstLow = lows[i];
                const secondLow = lows[j];
                
                // شروط القاع الثنائي
                const priceDiff = Math.abs(firstLow.low - secondLow.low) / firstLow.low;
                const timeDiff = secondLow.index - firstLow.index;
                const middleHigh = this.findHighestBetween(candles, firstLow.index, secondLow.index);
                
                if (priceDiff < 0.03 && // فرق أقل من 3%
                    timeDiff > 15 && timeDiff < 80 && // مسافة زمنية مناسبة
                    middleHigh && middleHigh.high > firstLow.low * 1.05) { // قمة واضحة بينهما
                    
                    const neckline = middleHigh.high;
                    const currentPrice = candles[candles.length - 1].close;
                    const breakoutConfirmed = currentPrice > neckline;
                    
                    return {
                        detected: true,
                        type: 'double-bottom',
                        confidence: this.calculateDoubleBottomConfidence(firstLow, secondLow, middleHigh, candles),
                        neckline: neckline,
                        target1: neckline + (neckline - Math.min(firstLow.low, secondLow.low)) * 0.618,
                        target2: neckline + (neckline - Math.min(firstLow.low, secondLow.low)),
                        stopLoss: Math.min(firstLow.low, secondLow.low) * 0.98,
                        breakoutStatus: breakoutConfirmed ? 'مؤكد' : 'في انتظار التأكيد',
                        signalStrength: breakoutConfirmed ? 'قوية' : 'متوسطة'
                    };
                }
            }
        }
        
        return { detected: false };
    }

    detectHeadAndShoulders(candles) {
        if (candles.length < 60) return { detected: false };

        const highs = this.findLocalHighs(candles, 8);
        
        for (let i = 0; i < highs.length - 2; i++) {
            const leftShoulder = highs[i];
            const head = highs[i + 1];
            const rightShoulder = highs[i + 2];
            
            // شروط الرأس والكتفين
            const headHigher = head.high > leftShoulder.high && head.high > rightShoulder.high;
            const shouldersEqual = Math.abs(leftShoulder.high - rightShoulder.high) / leftShoulder.high < 0.05;
            const headSignificant = head.high > leftShoulder.high * 1.03;
            
            if (headHigher && shouldersEqual && headSignificant) {
                const leftLow = this.findLowestBetween(candles, leftShoulder.index, head.index);
                const rightLow = this.findLowestBetween(candles, head.index, rightShoulder.index);
                
                if (leftLow && rightLow) {
                    const neckline = (leftLow.low + rightLow.low) / 2;
                    const currentPrice = candles[candles.length - 1].close;
                    const breakoutConfirmed = currentPrice < neckline;
                    
                    return {
                        detected: true,
                        type: 'head-shoulders',
                        confidence: this.calculateHeadShouldersConfidence(leftShoulder, head, rightShoulder, candles),
                        neckline: neckline,
                        target1: neckline - (head.high - neckline) * 0.618,
                        target2: neckline - (head.high - neckline),
                        stopLoss: head.high * 1.02,
                        breakoutStatus: breakoutConfirmed ? 'مؤكد' : 'في انتظار التأكيد',
                        signalStrength: breakoutConfirmed ? 'قوية' : 'متوسطة'
                    };
                }
            }
        }
        
        return { detected: false };
    }

    detectTriangles(candles) {
        if (candles.length < 40) return { detected: false };

        const recentCandles = candles.slice(-40);
        const highs = this.findLocalHighs(recentCandles, 5);
        const lows = this.findLocalLows(recentCandles, 5);
        
        if (highs.length < 3 || lows.length < 3) return { detected: false };

        // تحليل اتجاه القمم والقيعان
        const highTrend = this.calculateTrend(highs.map(h => h.high));
        const lowTrend = this.calculateTrend(lows.map(l => l.low));
        
        let triangleType = null;
        let resistance = null;
        let support = null;
        
        if (Math.abs(highTrend) < 0.001 && lowTrend > 0.002) {
            // مثلث صاعد
            triangleType = 'ascending-triangle';
            resistance = highs.reduce((sum, h) => sum + h.high, 0) / highs.length;
            support = this.calculateTrendLine(lows);
        } else if (Math.abs(lowTrend) < 0.001 && highTrend < -0.002) {
            // مثلث هابط
            triangleType = 'descending-triangle';
            support = lows.reduce((sum, l) => sum + l.low, 0) / lows.length;
            resistance = this.calculateTrendLine(highs);
        } else if (highTrend < -0.001 && lowTrend > 0.001) {
            // مثلث متماثل
            triangleType = 'symmetrical-triangle';
            resistance = this.calculateTrendLine(highs);
            support = this.calculateTrendLine(lows);
        }
        
        if (triangleType) {
            const currentPrice = candles[candles.length - 1].close;
            const priceRange = resistance - support;
            const breakoutConfirmed = this.checkTriangleBreakout(currentPrice, resistance, support, triangleType);
            
            return {
                detected: true,
                type: triangleType,
                confidence: this.calculateTriangleConfidence(highs, lows, priceRange),
                resistance: resistance,
                support: support,
                target1: triangleType === 'ascending-triangle' ? resistance + priceRange * 0.618 : support - priceRange * 0.618,
                target2: triangleType === 'ascending-triangle' ? resistance + priceRange : support - priceRange,
                stopLoss: triangleType === 'ascending-triangle' ? support * 0.98 : resistance * 1.02,
                breakoutStatus: breakoutConfirmed.status,
                signalStrength: breakoutConfirmed.strength
            };
        }
        
        return { detected: false };
    }

    findLocalLows(candles, period = 5) {
        const lows = [];
        for (let i = period; i < candles.length - period; i++) {
            let isLow = true;
            for (let j = i - period; j <= i + period; j++) {
                if (j !== i && candles[j].low <= candles[i].low) {
                    isLow = false;
                    break;
                }
            }
            if (isLow) {
                lows.push({ index: i, low: candles[i].low, timestamp: candles[i].timestamp });
            }
        }
        return lows;
    }

    findLocalHighs(candles, period = 5) {
        const highs = [];
        for (let i = period; i < candles.length - period; i++) {
            let isHigh = true;
            for (let j = i - period; j <= i + period; j++) {
                if (j !== i && candles[j].high >= candles[i].high) {
                    isHigh = false;
                    break;
                }
            }
            if (isHigh) {
                highs.push({ index: i, high: candles[i].high, timestamp: candles[i].timestamp });
            }
        }
        return highs;
    }

    calculateDoubleBottomConfidence(firstLow, secondLow, middleHigh, candles) {
        let confidence = 0.5;
        
        // دقة تطابق القيعان
        const priceDiff = Math.abs(firstLow.low - secondLow.low) / firstLow.low;
        confidence += (0.03 - priceDiff) * 10; // كلما قل الفرق، زادت الثقة
        
        // قوة القمة الوسطى
        const middleStrength = (middleHigh.high - Math.min(firstLow.low, secondLow.low)) / Math.min(firstLow.low, secondLow.low);
        confidence += Math.min(middleStrength * 2, 0.3);
        
        // تأكيد الحجم
        const volumeConfirmation = this.checkVolumePattern(candles, firstLow.index, secondLow.index);
        confidence += volumeConfirmation * 0.2;
        
        return Math.min(confidence, 0.95);
    }

    calculateHeadShouldersConfidence(leftShoulder, head, rightShoulder, candles) {
        let confidence = 0.6;
        
        // تماثل الكتفين
        const shoulderSymmetry = 1 - Math.abs(leftShoulder.high - rightShoulder.high) / leftShoulder.high;
        confidence += shoulderSymmetry * 0.2;
        
        // بروز الرأس
        const headProminence = (head.high - Math.max(leftShoulder.high, rightShoulder.high)) / head.high;
        confidence += Math.min(headProminence * 3, 0.2);
        
        return Math.min(confidence, 0.95);
    }

    calculateTriangleConfidence(highs, lows, priceRange) {
        let confidence = 0.5;
        
        // عدد نقاط التلامس
        confidence += Math.min((highs.length + lows.length) * 0.05, 0.3);
        
        // تقارب الخطوط
        const convergence = priceRange / highs[0].high;
        confidence += Math.min((0.1 - convergence) * 2, 0.2);
        
        return Math.min(confidence, 0.9);
    }

    checkVolumePattern(candles, startIndex, endIndex) {
        const volumeData = candles.slice(startIndex, endIndex + 1).map(c => c.volume);
        const avgVolume = volumeData.reduce((sum, v) => sum + v, 0) / volumeData.length;
        const recentVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
        
        return recentVolume > avgVolume ? 1 : 0.5;
    }

    processCoinWithRealData(coin, analysis) {
        const price = parseFloat(coin.lastPrice);
        const change = parseFloat(coin.priceChangePercent);
        const pattern = analysis.pattern;
        
        return {
            symbol: coin.symbol,
            name: coin.symbol.replace('USDT', ''),
            price: price,
            change: change,
            volume: parseFloat(coin.volume),
            quoteVolume: parseFloat(coin.quoteVolume),
            pattern: pattern.type,
            patternInfo: this.patterns[pattern.type],
            targets: {
                target1: pattern.target1.toFixed(6),
                target2: pattern.target2.toFixed(6),
                stopLoss: pattern.stopLoss.toFixed(6)
            },
            breakoutStatus: pattern.breakoutStatus,
            signalStrength: pattern.signalStrength,
            confidence: (pattern.confidence * 100).toFixed(1) + '%',
            neckline: pattern.neckline ? pattern.neckline.toFixed(6) : null,
            lastUpdate: new Date()
        };
    }

    // باقي الدوال تبقى كما هي...
    renderCards() {
        const grid = document.getElementById('cardsGrid');
        grid.innerHTML = '';

        if (this.cryptoData.size === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #888;">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <h3>لا توجد أنماط مكتشفة حالياً</h3>
                    <p>جاري البحث عن أنماط فنية جديدة...</p>
                </div>
            `;
            return;
        }

        this.cryptoData.forEach((coin, symbol) => {
            const card = this.createCoinCard(coin);
            grid.appendChild(card);
        });
    }

    createCoinCard(coin) {
        const card = document.createElement('div');
        card.className = 'crypto-card';
        card.setAttribute('data-symbol', coin.symbol);
        card.setAttribute('data-pattern', coin.pattern);

        const changeClass = coin.change >= 0 ? 'positive' : 'negative';
        const changeIcon = coin.change >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';

        card.innerHTML = `
            <div class="card-header">
                <div class="coin-logo">
                    ${coin.name.charAt(0)}
                </div>
                <div class="coin-info">
                    <h3>${coin.name}</h3>
                    <span class="symbol">${coin.symbol}</span>
                </div>
            </div>
            
            <div class="price-section">
                <div class="current-price">$${coin.price.toFixed(6)}</div>
                <div class="price-change ${changeClass}">
                    <i class="fas ${changeIcon}"></i>
                    <span>${Math.abs(coin.change).toFixed(2)}%</span>
                </div>
            </div>
            
            <div class="card-stats">
                <div class="stat-item">
                    <div class="stat-label">حجم السيولة</div>
                    <div class="stat-value">$${this.formatNumber(coin.volume)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">حجم التداول</div>
                    <div class="stat-value">$${this.formatNumber(coin.quoteVolume)}</div>
                </div>
            </div>
            
            <div class="pattern-badge">
                <span class="pattern-level">${coin.patternInfo.level}</span>
                ${coin.patternInfo.name}
                <div style="font-size: 0.7rem; margin-top: 0.25rem;">
                    دقة: ${coin.confidence}
                </div>
            </div>
        `;

        card.addEventListener('click', () => this.showPatternModal(coin));
        return card;
    }

    // باقي الدوال (showPatternModal, setupEventListeners, إلخ) تبقى كما هي
    showPatternModal(coin) {
        const modal = document.getElementById('patternModal');
        const modalTitle = document.getElementById('modalTitle');
        const patternType = document.getElementById('patternType');
        const patternLevel = document.getElementById('patternLevel');
        const breakoutStatus = document.getElementById('breakoutStatus');
        const signalStrength = document.getElementById('signalStrength');
        const target1 = document.getElementById('target1');
        const target2 = document.getElementById('target2');
        const stopLoss = document.getElementById('stopLoss');
        const patternDescription = document.getElementById('patternDescription');
        modalTitle.textContent = `${coin.name} - ${coin.patternInfo.name}`;
        patternType.textContent = coin.patternInfo.type;
        patternLevel.textContent = coin.patternInfo.level;
        breakoutStatus.textContent = coin.breakoutStatus;
        signalStrength.textContent = coin.signalStrength;
        target1.textContent = `$${coin.targets.target1}`;
        target2.textContent = `$${coin.targets.target2}`;
        stopLoss.textContent = `$${coin.targets.stopLoss}`;
        patternDescription.textContent = coin.patternInfo.description;

        // إضافة معلومات إضافية للنافذة المنبثقة
        const additionalInfo = document.getElementById('additionalInfo') || this.createAdditionalInfoSection(modal);
        additionalInfo.innerHTML = `
            <div class="confidence-section">
                <h4>مستوى الثقة في النمط</h4>
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${coin.confidence}"></div>
                </div>
                <span class="confidence-text">${coin.confidence}</span>
            </div>
            ${coin.neckline ? `
                <div class="neckline-section">
                    <h4>خط العنق</h4>
                    <span class="neckline-price">$${coin.neckline}</span>
                </div>
            ` : ''}
            <div class="analysis-time">
                <small>آخر تحليل: ${coin.lastUpdate.toLocaleString('ar-SA')}</small>
            </div>
        `;

        modal.style.display = 'block';
    }

    createAdditionalInfoSection(modal) {
        const additionalInfo = document.createElement('div');
        additionalInfo.id = 'additionalInfo';
        additionalInfo.className = 'additional-info';
        modal.querySelector('.modal-content').appendChild(additionalInfo);
        return additionalInfo;
    }

    setupEventListeners() {
        // إغلاق النافذة المنبثقة
        const closeModal = document.getElementById('closeModal');
        const modal = document.getElementById('patternModal');
        
        closeModal.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        // فلترة الأنماط
        const patternFilter = document.getElementById('patternFilter');
        patternFilter.addEventListener('change', (e) => {
            this.filterByPattern(e.target.value);
        });

        // البحث
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchCoins(e.target.value);
        });

        // إضافة خيارات الفلترة الديناميكية
        this.populatePatternFilter();
    }

    populatePatternFilter() {
        const patternFilter = document.getElementById('patternFilter');
        const detectedPatterns = new Set();
        
        this.cryptoData.forEach(coin => {
            detectedPatterns.add(coin.pattern);
        });

        // مسح الخيارات الحالية (عدا "جميع الأنماط")
        while (patternFilter.children.length > 1) {
            patternFilter.removeChild(patternFilter.lastChild);
        }

        // إضافة الأنماط المكتشفة
        detectedPatterns.forEach(pattern => {
            const option = document.createElement('option');
            option.value = pattern;
            option.textContent = this.patterns[pattern].name;
            patternFilter.appendChild(option);
        });
    }

    filterByPattern(pattern) {
        const cards = document.querySelectorAll('.crypto-card');
        cards.forEach(card => {
            const cardPattern = card.getAttribute('data-pattern');
            if (!pattern || cardPattern === pattern) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    searchCoins(query) {
        const cards = document.querySelectorAll('.crypto-card');
        const searchTerm = query.toLowerCase();
        
        cards.forEach(card => {
            const symbol = card.getAttribute('data-symbol').toLowerCase();
            if (symbol.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    startRealTimeUpdates() {
        // تحديث الأسعار كل 30 ثانية
        setInterval(() => {
            this.updatePrices();
        }, 30000);

        // إعادة تحليل الأنماط كل 5 دقائق
        setInterval(() => {
            this.refreshPatternAnalysis();
        }, 300000);
    }

    async updatePrices() {
        try {
            const symbols = Array.from(this.cryptoData.keys()).join(',');
            const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr`);
            const data = await response.json();
            
            data.forEach(coin => {
                if (this.cryptoData.has(coin.symbol)) {
                    const existingCoin = this.cryptoData.get(coin.symbol);
                    const oldPrice = existingCoin.price;
                    const newPrice = parseFloat(coin.lastPrice);
                    
                    existingCoin.price = newPrice;
                    existingCoin.change = parseFloat(coin.priceChangePercent);
                    existingCoin.volume = parseFloat(coin.volume);
                    existingCoin.quoteVolume = parseFloat(coin.quoteVolume);
                    existingCoin.lastUpdate = new Date();
                    
                    // تحديث حالة الاختراق بناءً على السعر الجديد
                    this.updateBreakoutStatus(existingCoin, oldPrice, newPrice);
                }
            });
            
            this.renderCards();
        } catch (error) {
            console.error('خطأ في تحديث الأسعار:', error);
        }
    }

    updateBreakoutStatus(coin, oldPrice, newPrice) {
        if (!coin.neckline) return;

        const neckline = parseFloat(coin.neckline);
        
        if (coin.patternInfo.type.includes('صاعد')) {
            // للأنماط الصاعدة
            if (newPrice > neckline && oldPrice <= neckline) {
                coin.breakoutStatus = 'مؤكد - اختراق جديد';
                coin.signalStrength = 'قوية جداً';
            } else if (newPrice > neckline) {
                coin.breakoutStatus = 'مؤكد';
                coin.signalStrength = 'قوية';
            }
        } else if (coin.patternInfo.type.includes('هابط')) {
            // للأنماط الهابطة
            if (newPrice < neckline && oldPrice >= neckline) {
                coin.breakoutStatus = 'مؤكد - اختراق جديد';
                coin.signalStrength = 'قوية جداً';
            } else if (newPrice < neckline) {
                coin.breakoutStatus = 'مؤكد';
                coin.signalStrength = 'قوية';
            }
        }
    }

    async refreshPatternAnalysis() {
        console.log('إعادة تحليل الأنماط...');
        
        // إعادة تحليل العملات الموجودة
        const symbols = Array.from(this.cryptoData.keys());
        for (const symbol of symbols) {
            const analysis = await this.analyzeRealPattern(symbol);
            if (!analysis.patternDetected) {
                // إذا لم يعد النمط موجوداً، احذف العملة
                this.cryptoData.delete(symbol);
            }
        }

        // البحث عن أنماط جديدة
        await this.fetchAndAnalyzeData();
    }

    // دوال مساعدة إضافية للتحليل الفني

    findHighestBetween(candles, startIndex, endIndex) {
        let highest = null;
        for (let i = startIndex; i <= endIndex; i++) {
            if (!highest || candles[i].high > highest.high) {
                highest = { index: i, high: candles[i].high };
            }
        }
        return highest;
    }

    findLowestBetween(candles, startIndex, endIndex) {
        let lowest = null;
        for (let i = startIndex; i <= endIndex; i++) {
            if (!lowest || candles[i].low < lowest.low) {
                lowest = { index: i, low: candles[i].low };
            }
        }
        return lowest;
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        const n = values.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0);
        const sumX2 = values.reduce((sum, val, index) => sum + (index * index), 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope / values[0]; // تطبيع النتيجة
    }

    calculateTrendLine(points) {
        if (points.length < 2) return points[0]?.high || points[0]?.low || 0;
        
        const values = points.map(p => p.high || p.low);
        const trend = this.calculateTrend(values);
        const lastValue = values[values.length - 1];
        
        return lastValue + (trend * lastValue);
    }

    checkTriangleBreakout(currentPrice, resistance, support, triangleType) {
        const priceRange = resistance - support;
        const breakoutThreshold = priceRange * 0.02; // 2% من النطاق
        
        if (triangleType === 'ascending-triangle') {
            if (currentPrice > resistance + breakoutThreshold) {
                return { status: 'مؤكد', strength: 'قوية' };
            } else if (currentPrice > resistance) {
                return { status: 'محتمل', strength: 'متوسطة' };
            }
        } else if (triangleType === 'descending-triangle') {
            if (currentPrice < support - breakoutThreshold) {
                return { status: 'مؤكد', strength: 'قوية' };
            } else if (currentPrice < support) {
                return { status: 'محتمل', strength: 'متوسطة' };
            }
        } else if (triangleType === 'symmetrical-triangle') {
            if (currentPrice > resistance + breakoutThreshold) {
                return { status: 'مؤكد صاعد', strength: 'قوية' };
            } else if (currentPrice < support - breakoutThreshold) {
                return { status: 'مؤكد هابط', strength: 'قوية' };
            } else if (currentPrice > resistance || currentPrice < support) {
                return { status: 'محتمل', strength: 'متوسطة' };
            }
        }
        
        return { status: 'في انتظار التأكيد', strength: 'ضعيفة' };
    }

    formatNumber(num) {
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toFixed(0);
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById('cardsGrid');
        
        if (show) {
            loading.style.display = 'block';
            grid.style.display = 'none';
        } else {
            loading.style.display = 'none';
            grid.style.display = 'grid';
        }
    }

    showError(message) {
        const grid = document.getElementById('cardsGrid');
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #ff4757;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h3>حدث خطأ</h3>
                <p>${message}</p>
                <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #00d4ff; border: none; border-radius: 5px; color: #000; cursor: pointer;">
                    إعادة المحاولة
                </button>
            </div>
        `;
    }
}

// تشغيل التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    new RealPatternDetector();
});

// إضافة مؤثرات بصرية إضافية
document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.crypto-card');
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        } else {
            card.style.transform = '';
        }
    });
});

// إضافة إشعارات للاختراقات الجديدة
class BreakoutNotifier {
    constructor() {
        this.previousBreakouts = new Set();
        this.setupNotifications();
    }

    setupNotifications() {
        // طلب إذن الإشعارات
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    checkForNewBreakouts(cryptoData) {
        cryptoData.forEach((coin, symbol) => {
            const breakoutKey = `${symbol}-${coin.breakoutStatus}`;
            
            if (coin.breakoutStatus.includes('مؤكد') && !this.previousBreakouts.has(breakoutKey)) {
                this.showBreakoutNotification(coin);
                this.previousBreakouts.add(breakoutKey);
            }
        });
    }

    showBreakoutNotification(coin) {
        // إشعار المتصفح
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`اختراق جديد: ${coin.name}`, {
                body: `تم اختراق نمط ${coin.patternInfo.name} - الهدف: $${coin.targets.target1}`,
                icon: '/favicon.ico'
            });
        }

        // إشعار داخل الصفحة
        this.showInPageNotification(coin);
    }

    showInPageNotification(coin) {
        const notification = document.createElement('div');
        notification.className = 'breakout-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-chart-line"></i>
                <div>
                    <strong>${coin.name}</strong>
                    <p>اختراق نمط ${coin.patternInfo.name}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // إزالة الإشعار بعد 5 ثوان
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// تشغيل نظام الإشعارات
const notifier = new BreakoutNotifier();

// مراقبة التغييرات في البيانات للإشعارات
const originalRenderCards = RealPatternDetector.prototype.renderCards;
RealPatternDetector.prototype.renderCards = function() {
    originalRenderCards.call(this);
    notifier.checkForNewBreakouts(this.cryptoData);
};
