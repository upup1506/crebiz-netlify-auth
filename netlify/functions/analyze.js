// netlify/functions/analyze.js
// CreBiz YouTube Analytics Tool - 서버 사이드 분석 로직 (고도화 버전)

exports.handler = async (event) => {
  try {
    // 0) 메서드 체크 (POST만 허용)
    if (event.httpMethod && event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Only POST allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const videos = Array.isArray(body.videos) ? body.videos : [];
    if (!videos.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ results: [], top10: [] }),
      };
    }

    const now = Date.now();

    // -----------------------------------------
    // ① 기본 계산: daysSincePublished, viewsPerDay
    //    (viewCountRaw / subscriberCountRaw 이름도 대응)
    // -----------------------------------------
    const enriched = videos.map((v) => {
      const id =
        v.id || v.videoId || ""; // 혹시 videoId로 보냈어도 안전하게 처리

      const views = Number(
        v.viewCount != null ? v.viewCount : v.viewCountRaw != null ? v.viewCountRaw : 0
      ) || 0;

      const subs = Number(
        v.subscriberCount != null
          ? v.subscriberCount
          : v.subscriberCountRaw != null
          ? v.subscriberCountRaw
          : 0
      ) || 0;

      const publishedAt =
        v.publishedAt || v.publishedAtRaw || null;

      let daysSincePublished = null;
      let viewsPerDay = null;

      if (publishedAt) {
        const publishedMs = Date.parse(publishedAt);
        if (!isNaN(publishedMs)) {
          daysSincePublished = Math.max(
            1,
            Math.floor((now - publishedMs) / (1000 * 60 * 60 * 24))
          );
          viewsPerDay = views / daysSincePublished;
        }
      }

      return {
        id,
        views,
        subs,
        publishedAt,
        daysSincePublished,
        viewsPerDay,
      };
    });

    // -----------------------------------------
    // ② 기여도 고도화: ratio → log 스케일 → zScore
    // -----------------------------------------
    enriched.forEach((v) => {
      if (v.views > 0 && v.subs > 0) {
        v.ratio = v.views / v.subs; // 기본 ratio
      } else {
        v.ratio = null;
      }
    });

    // ratio의 log 스케일 처리
    enriched.forEach((v) => {
      if (v.ratio !== null) {
        v.logRatio = Math.log10(v.ratio + 1e-9);
      } else {
        v.logRatio = null;
      }
    });

    const validLogRatios = enriched
      .map((v) => v.logRatio)
      .filter((x) => x !== null && !isNaN(x));

    const mean =
      validLogRatios.reduce((a, b) => a + b, 0) / validLogRatios.length;
    const variance =
      validLogRatios.reduce((a, b) => a + (b - mean) ** 2, 0) /
      validLogRatios.length;
    const std = Math.sqrt(variance) || 1;

    enriched.forEach((v) => {
      if (v.logRatio !== null) {
        v.ratioZ = (v.logRatio - mean) / std;
      } else {
        v.ratioZ = null;
      }
    });

    // ratioZ → 1~5 레벨 변환 (채널 내부 상대 평가)
    enriched.forEach((v) => {
      const z = v.ratioZ;
      let level = 1;
      if (z === null) level = 1;
      else if (z < -0.5) level = 1;
      else if (z < 0.3) level = 2;
      else if (z < 1.0) level = 3;
      else if (z < 2.0) level = 4;
      else level = 5;

      v.ratioLevel = level;
    });

    // -----------------------------------------
    // ③ 지속 성장 판단: 상위 25% viewsPerDay 기준
    // -----------------------------------------
    const vpdCandidates = enriched
      .filter((v) => v.daysSincePublished >= 90 && v.viewsPerDay > 0)
      .map((v) => v.viewsPerDay)
      .sort((a, b) => b - a);

    let sustainThreshold = null;
    if (vpdCandidates.length > 0) {
      const idx = Math.floor(vpdCandidates.length * 0.25);
      sustainThreshold = vpdCandidates[idx] || vpdCandidates[0];
    }

    enriched.forEach((v) => {
      v.isSustained =
        sustainThreshold &&
        v.daysSincePublished >= 90 &&
        v.viewsPerDay >= sustainThreshold
          ? true
          : false;
    });

    // -----------------------------------------
    // ④ 노출확률 고도화 (viewsPerDay + age + 지속 성장)
    // -----------------------------------------
    enriched.forEach((v) => {
      const vpd = v.viewsPerDay || 0;

      // age factor (최근 영상 가산, 오래된 영상 감산)
      let ageFactor = 1;
      const d = v.daysSincePublished;
      if (d <= 7) ageFactor = 1.3;
      else if (d <= 30) ageFactor = 1.15;
      else if (d <= 90) ageFactor = 1.0;
      else if (d <= 365) ageFactor = 0.75;
      else ageFactor = 0.5;

      const sustainBoost = v.isSustained ? 1.15 : 1.0;

      const exposureScore = Math.log10(vpd + 1) * ageFactor * sustainBoost;
      v.exposureScore = exposureScore;

      // exposureScore → 1~5 레벨 변환
      let el = 1;
      if (exposureScore < 0.15) el = 1;
      else if (exposureScore < 0.3) el = 2;
      else if (exposureScore < 0.5) el = 3;
      else if (exposureScore < 0.8) el = 4;
      else el = 5;

      v.exposureLevel = el;
    });

    // -----------------------------------------
    // ⑤ 종합 점수: 기여도 + 노출확률 혼합
    // -----------------------------------------
    enriched.forEach((v) => {
      const nr = v.ratioLevel / 5;     // 0~1
      const ne = v.exposureLevel / 5;  // 0~1
      v.combinedScore = 0.6 * nr + 0.4 * ne;
    });

    // TOP10 영상 추출 (combinedScore 기준)
    const top10 = enriched
      .slice()
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 10)
      .map((v) => v.id);

    // -----------------------------------------
    // 응답
    // -----------------------------------------
    return {
      statusCode: 200,
      body: JSON.stringify({
        results: enriched,
        top10,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: String(err) }),
    };
  }
};
