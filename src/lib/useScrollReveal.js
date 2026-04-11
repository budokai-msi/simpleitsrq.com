// src/lib/useScrollReveal.js
//
// Lightweight scroll-triggered reveal animations using Intersection Observer.
//
// useScrollReveal()       — returns a ref. Attach to one element.
// useRevealChildren(ref)  — observes all [data-reveal] inside the ref's element.

import { useEffect, useRef } from "react";

const observed = new WeakSet();

let observer;
function getObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
  );
  return observer;
}

export function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || observed.has(el)) return;
    observed.add(el);
    getObserver().observe(el);
    return () => {
      getObserver().unobserve(el);
    };
  }, []);
  return ref;
}

export function useRevealChildren(ref) {
  useEffect(() => {
    const parent = ref.current;
    if (!parent) return;
    const children = parent.querySelectorAll("[data-reveal]");
    const obs = getObserver();
    children.forEach((el) => {
      if (!observed.has(el)) {
        observed.add(el);
        obs.observe(el);
      }
    });
    return () => children.forEach((el) => obs.unobserve(el));
  }, [ref]);
}
