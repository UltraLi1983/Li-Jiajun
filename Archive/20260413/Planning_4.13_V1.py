import csv

import math

import os

import sys

import pandas as pd

from datetime import datetime

import time





# ==========================================

# 1. 核心计算逻辑 (Core Logic)

# ==========================================



class ProcessStep:

    def __init__(self, name, std_proc_time, num_machines, perf_rate, avail_rate, qual_rate, cv_proc=0.0,

                 is_transport=False, allocation_percentage=100.0):

        self.name = name

        self.std_proc_time = std_proc_time

        self.num_machines = num_machines

        self.perf_rate = perf_rate

        self.avail_rate = avail_rate

        self.qual_rate = qual_rate

        self.cv_proc = cv_proc

        self.is_transport = is_transport

        self.allocation_percentage = allocation_percentage  # 优化4：分配百分比

        self.handling_unit = 1  # HU包装单位（默认1）

        self.day_capacity = 0  # 天产能



        # --- Basic Metrics ---

        self.effective_time = 0.0

        self.utilization = 0.0

        self.theoretical_capacity = 0.0

        self.effective_capacity = 0.0

        self.oee_value = 0.0



        # --- New Metric: Adjusted Demand ---

        self.adjusted_demand = 0.0  # The actual quantity this step must process

        self.cumulative_yield_to_end = 1.0  # Yield from this step to the end



        # --- WIP Metrics (Current State) ---

        self.wait_time = 0.0

        self.base_wip = 0.0

        self.queue_wip = 0.0

        self.target_wip = 0.0



        # --- Expansion Metrics ---

        self.additional_machines = 0

        self.total_machines_needed = 0

        self.projected_utilization = 0.0

        self.is_overloaded = False



        # --- Target State WIP (After Expansion) ---

        self.target_wip_projected = 0.0

        self.base_wip_projected = 0.0

        self.queue_wip_projected = 0.0



        self.wip_int = 0

        self.queue_int = 0

        self.base_int = 0



        self.wip_int_proj = 0

        self.queue_int_proj = 0

        self.base_int_proj = 0



        self.step_index = None

        self.current_cv_arrival = 1.0



        # === NEW: WIP Storage Metrics ===

        self.wip_storage_absolute = 0.0  # WIP存储需求（绝对值，件数）

        self.wip_storage_hu = 0  # WIP存储需求（HU个数）

        self.wip_storage_absolute_proj = 0.0  # 扩产后WIP存储需求（绝对值）

        self.wip_storage_hu_proj = 0  # 扩产后WIP存储需求（HU个数）

        self.wip_storage_upstream_name = ''  # WIP Storage的上游工序名称（优先英文）



    @staticmethod

    def extract_english_name(full_name):

        """从工序名称中提取英文名称（中文 / English 格式）"""

        if not full_name:

            return ''

        # 尝试匹配 "中文 / English" 格式

        import re

        match = re.match(r'.*?/\s*(.+)', full_name)

        if match:

            return match.group(1).strip()

        # 如果没有分隔符，返回原名

        return full_name



def calculate_wip_scenario(steps, demand, available_time, scheduled_days=0, shifts_per_day=0, hours_per_shift=0, target_util=0.85):

    if demand <= 0:

        return [], 0



    # Global Takt Time is based on Final Demand

    takt_time_final = available_time / demand



    results = []



    # ---------------------------------------------------------

    # Step 1: Initialize Objects & Calculate Cumulative Yields (Backward Pass)

    # We need to know how many parts each station must process to satisfy final demand.

    # ---------------------------------------------------------



    # First, create all objects without calculation to establish order

    temp_steps = []

    for step in steps:

        s = ProcessStep(

            step.name, step.std_proc_time, step.num_machines,

            step.perf_rate, step.avail_rate, step.qual_rate,

            step.cv_proc, step.is_transport,

            getattr(step, 'allocation_percentage', 100.0)  # 优化4：传递分配百分比

        )

        temp_steps.append(s)



    # Calculate Adjusted Demand for each step (Backward Iteration)

    # Logic: To get 1 good part at the END, how many must I process at CURRENT?

    # Factor = 1 / (Qual_Current * Qual_Next * ... * Qual_Last)



    cumulative_yield_from_here = 1.0



    # Iterate backwards

    for i in range(len(temp_steps) - 1, -1, -1):

        s = temp_steps[i]



        if s.is_transport:

            # Transport usually doesn't have yield loss in this model, or handled separately

            # For safety, assume transport yield is 1.0 unless specified

            s.cumulative_yield_to_end = cumulative_yield_from_here

            s.adjusted_demand = demand / cumulative_yield_from_here

        else:

            # Update cumulative yield: Include current step's quality rate

            # If current qual is 0.95, and downstream cumulative is 0.90, total from here is 0.95*0.90

            if s.qual_rate <= 0: s.qual_rate = 0.01  # Prevent div by zero



            cumulative_yield_from_here *= s.qual_rate

            s.cumulative_yield_to_end = cumulative_yield_from_here



            # 优化4：考虑分配百分比，adjusted_demand = 需求 / 累计良率 / 分配百分比

            s.adjusted_demand = (demand / cumulative_yield_from_here) / (s.allocation_percentage / 100.0)



    # ---------------------------------------------------------

    # Step 2: Forward Calculation (Metrics, Utilization, WIP)

    # Now use s.adjusted_demand instead of global 'demand' for each step

    # ---------------------------------------------------------



    current_cv_arrival = 1.0



    for s in temp_steps:

        s.current_cv_arrival = current_cv_arrival



        if s.is_transport:

            s.effective_time = s.std_proc_time

            s.step_index = None

            s.is_overloaded = False

            s.additional_machines = 0

            s.total_machines_needed = s.num_machines

            s.projected_utilization = 0.0

            s.oee_value = 1.0



            s.theoretical_capacity = (available_time / s.std_proc_time) * s.num_machines if s.std_proc_time > 0 else 0

            s.effective_capacity = s.theoretical_capacity



            # Use adjusted demand for WIP calculation

            throughput_rate = s.adjusted_demand / available_time

            s.base_wip = s.effective_time * throughput_rate

            s.queue_wip = 0.0

            s.target_wip = s.base_wip

            s.target_wip_projected = s.target_wip



            s.wip_int = math.ceil(s.target_wip) if s.target_wip > 0 else 0

            s.queue_int = 0

            s.base_int = math.ceil(s.base_wip) if s.base_wip > 0 else 0



            # 添加运输步骤的 projected WIP 属性

            s.wip_int_proj = s.wip_int

            s.queue_int_proj = 0

            s.base_int_proj = s.base_int



            # 运输步骤也设置工作天数和产出指标

            s.scheduled_days = scheduled_days

            s.recommended_days = None  # 运输步骤不计算建议天数

            s.output_based_on_scheduled_days = 0  # 运输不产出零件

            s.output_based_on_recommended_days = 0

            s.wip_storage_absolute = 0  # 运输步骤不需要WIP Storage

            s.wip_storage_hu = 0

            s.wip_storage_absolute_proj = 0

            s.wip_storage_hu_proj = 0



            current_cv_arrival = max(0.5, s.cv_proc)

        else:

            # Calculate OEE

            s.oee_value = s.perf_rate * s.avail_rate * s.qual_rate



            oee_factor_no_qual = s.perf_rate * s.avail_rate

            if oee_factor_no_qual <= 0: oee_factor_no_qual = 0.01



            # Effective Time per part (including rework/scrap time implicitly via qual rate divisor)

            # Note: If we process 100 parts to get 95 good ones, the effective time per GOOD part

            # includes the time wasted on the 5 bad ones.

            s.effective_time = (s.std_proc_time / oee_factor_no_qual) / s.qual_rate



            # Calculate Capacities (Max Good Parts Output possible)

            s.theoretical_capacity = (available_time / s.std_proc_time) * s.num_machines if s.std_proc_time > 0 else 0

            s.effective_capacity = (available_time / s.effective_time) * s.num_machines if s.effective_time > 0 else 0



            # [FIXED] Utilization Calculation with Adjusted Demand

            # Utilization = (Adjusted Demand * Effective Time) / Total Available Time

            # OR: Utilization = Adjusted Demand / Effective Capacity

            if s.effective_capacity > 0:

                s.utilization = s.adjusted_demand / s.effective_capacity

            else:

                s.utilization = 0.0



            # Determine Overload and Expansion Needs

            if s.utilization > 1.0:

                s.is_overloaded = True

                total_equiv_machines = s.num_machines * s.utilization

                s.total_machines_needed = math.ceil(total_equiv_machines)

                s.additional_machines = s.total_machines_needed - s.num_machines

                s.projected_utilization = total_equiv_machines / s.total_machines_needed

            else:

                s.is_overloaded = False

                s.additional_machines = 0

                s.total_machines_needed = s.num_machines

                s.projected_utilization = s.utilization



            def calc_wip_details(util, cv_arr, cv_proc, eff_time, m_count, local_demand, avail_time):

                calc_util = min(util, 0.999)

                if calc_util >= 1.0:

                    return 9999.9, 9999.9, 9999.9



                variability_term = (cv_arr ** 2 + cv_proc ** 2) / 2

                exponent = math.sqrt(2 * (m_count + 1)) - 1

                congestion_term = (calc_util ** exponent) / (1 - calc_util)



                wait_time = congestion_term * variability_term * eff_time



                # Throughput rate specific to this station's load

                throughput_rate = local_demand / avail_time



                base = eff_time * throughput_rate

                queue = wait_time * throughput_rate

                total = base + queue

                return base, queue, total



            b_curr, q_curr, t_curr = calc_wip_details(

                s.utilization, s.current_cv_arrival, s.cv_proc, s.effective_time,

                s.num_machines, s.adjusted_demand, available_time

            )

            s.base_wip = b_curr

            s.queue_wip = q_curr

            s.target_wip = t_curr



            b_proj, q_proj, t_proj = calc_wip_details(

                s.projected_utilization, s.current_cv_arrival, s.cv_proc, s.effective_time,

                s.total_machines_needed, s.adjusted_demand, available_time

            )

            s.base_wip_projected = b_proj

            s.queue_wip_projected = q_proj

            s.target_wip_projected = t_proj



            s.wip_int = math.ceil(t_curr) if t_curr > 0 else 0

            s.queue_int = math.ceil(q_curr) if q_curr > 0 else 0

            s.base_int = math.ceil(b_curr) if b_curr > 0 else 0



            s.wip_int_proj = math.ceil(t_proj) if t_proj > 0 else 0

            s.queue_int_proj = math.ceil(q_proj) if q_proj > 0 else 0

            s.base_int_proj = math.ceil(b_proj) if b_proj > 0 else 0



            # === 计算天产能（考虑OEE和CV） ===

            seconds_per_day_for_capa = shifts_per_day * hours_per_shift * 3600 if shifts_per_day > 0 and hours_per_shift > 0 else 0

            cv_adjust_factor_capa = max(0.5, 1 - s.cv_proc * 0.2)

            if seconds_per_day_for_capa > 0 and s.std_proc_time > 0 and s.oee_value > 0:

                s.day_capacity = math.floor((seconds_per_day_for_capa * s.oee_value * s.num_machines / s.std_proc_time) * cv_adjust_factor_capa)

            else:

                s.day_capacity = 0



            # === NEW: Calculate Production Days & Output ===

            # 设置的工作天数（从Settings来）

            s.scheduled_days = scheduled_days



            # 计算建议排产天数（基于目标利用率）

            seconds_per_day = shifts_per_day * hours_per_shift * 3600 if shifts_per_day > 0 and hours_per_shift > 0 else 0

            if seconds_per_day > 0 and s.num_machines > 0 and s.effective_time > 0:

                required_seconds = s.adjusted_demand * s.effective_time / s.num_machines

                raw_days = required_seconds / seconds_per_day

                # 基于目标利用率计算建议天数

                if target_util > 0:

                    s.recommended_days = math.ceil(raw_days / target_util)

                else:

                    s.recommended_days = math.ceil(raw_days)

            else:

                s.recommended_days = 0



            # 计算基于设置天数的产出

            if seconds_per_day > 0 and s.num_machines > 0 and s.effective_time > 0:

                available_seconds_scheduled = s.scheduled_days * seconds_per_day

                # 产出 = 可用时间 / 有效时间（考虑OEE后的实际加工时间）

                s.output_based_on_scheduled_days = available_seconds_scheduled / s.effective_time * s.num_machines

            else:

                s.output_based_on_scheduled_days = 0



            # 计算基于建议天数的产出

            if seconds_per_day > 0 and s.recommended_days > 0 and s.effective_time > 0:

                available_seconds_recommended = s.recommended_days * seconds_per_day

                s.output_based_on_recommended_days = available_seconds_recommended / s.effective_time * s.num_machines

            else:

                s.output_based_on_recommended_days = s.adjusted_demand  # 如果没有建议天数，默认等于需求



            # === NEW: WIP Storage Calculation (基于转运间隔和上下工序节拍) ===

            # 查找上游工序和运输间隔

            upstream_process = None

            transport_interval = 0.0

            upstream_hu = 1



            # 正确的方法：在temp_steps中查找当前步骤之前的步骤

            current_idx = temp_steps.index(s)

            for j in range(current_idx - 1, -1, -1):

                prev_step = temp_steps[j]

                if not prev_step.is_transport:

                    upstream_process = prev_step

                    break

                elif prev_step.is_transport:

                    transport_interval = prev_step.std_proc_time



            # 计算WIP Storage需求

            # 逻辑：为了维持下游工序连续生产，需要WIP缓冲来应对：

            # 1. 节拍不匹配（上游产出速率 vs 下游消耗速率）

            # 2. 工序变异（CV）导致的波动

            # 3. 转运间隔导致的供应中断（如果存在）

            

            # 班次总时间（秒）

            shift_total_time = shifts_per_day * hours_per_shift * 3600 if shifts_per_day > 0 and hours_per_shift > 0 else 0

            if upstream_process and shift_total_time > 0:

                # 上游工序的有效节拍（考虑OEE）

                upstream_effective_cycle_time = upstream_process.effective_time / upstream_process.num_machines



                # 当前工序（下游）的有效节拍

                downstream_effective_cycle_time = s.effective_time / s.num_machines



                if upstream_effective_cycle_time > 0 and downstream_effective_cycle_time > 0:

                    # 使用上游工序的HU（因为WIP是上游工序的成品）

                    upstream_hu = upstream_process.handling_unit if hasattr(upstream_process, 'handling_unit') and upstream_process.handling_unit > 0 else 1



                    # 计算连续生产目标时长（默认目标：连续生产12小时 = 1个整班）

                    # 如果有转运间隔，考虑转运导致的供应中断

                    if transport_interval > 0:

                        # 有中间转运的情况：考虑转运间隔和节拍差异

                        

                        # 计算班次内有多少次WIP到达

                        arrivals_per_shift = shift_total_time / transport_interval



                        # 每次转运间隔内，上游工序能产出多少件

                        cv_adjust_factor = max(0.5, 1 - upstream_process.cv_proc * 0.2)

                        upstream_production_per_interval = (transport_interval / upstream_effective_cycle_time) * cv_adjust_factor



                        # 在等待下次转运WIP到来之前，下游工序会消耗多少

                        downstream_consumption_per_interval = transport_interval / downstream_effective_cycle_time if downstream_effective_cycle_time > 0 else 0



                        # 每个转运间隔的净消耗

                        net_consumption_per_interval = downstream_consumption_per_interval - upstream_production_per_interval



                        # 如果净消耗为正（下游消耗 > 上游生产），需要初始WIP缓冲

                        if net_consumption_per_interval > 0:

                            # 计算整个班次的总消耗

                            total_net_deficit = net_consumption_per_interval * arrivals_per_shift



                            # WIP Storage必须是HU的整数倍

                            s.wip_storage_hu = math.ceil(max(0, total_net_deficit) / upstream_hu) if upstream_hu > 0 else math.ceil(max(0, total_net_deficit))

                            s.wip_storage_absolute = s.wip_storage_hu * upstream_hu

                            s.wip_storage_upstream_name = ProcessStep.extract_english_name(upstream_process.name)  # 保存上游工序英文名称

                        else:

                            # 上游生产 >= 下游消耗，理论上不需要额外WIP

                            s.wip_storage_absolute = 0

                            s.wip_storage_hu = 0

                            s.wip_storage_upstream_name = ''

                    else:

                        # 没有中间转运的情况：基于节拍不匹配和变异缓冲计算WIP

                        

                        # 计算上游产出速率（件/秒）

                        upstream_production_rate = 1.0 / upstream_effective_cycle_time

                        

                        # 计算下游消耗速率（件/秒）

                        downstream_consumption_rate = 1.0 / downstream_effective_cycle_time

                        

                        # 目标：确保下游能连续生产12小时（1个整班）

                        # 考虑两种情况：

                        

                        # 情况1：下游比上游快（downstream_consumption_rate > upstream_production_rate）

                        # 上游供应跟不上，需要初始WIP缓冲

                        if downstream_consumption_rate > upstream_production_rate:

                            # 净消耗速率

                            net_consumption_rate = downstream_consumption_rate - upstream_production_rate

                            

                            # 连续生产12小时需要的初始WIP

                            # = 净消耗速率 × 目标连续生产时长

                            target_continuous_hours = 12  # 目标连续生产时长（小时）

                            target_continuous_seconds = target_continuous_hours * 3600

                            

                            initial_wip_needed = net_consumption_rate * target_continuous_seconds

                            

                            # 考虑上游CV带来的变异缓冲需求

                            # CV越高，需要的额外缓冲越大

                            variability_buffer = upstream_process.cv_proc * downstream_consumption_rate * 3600  # 1小时的变异缓冲

                            

                            total_wip_storage = initial_wip_needed + variability_buffer

                            

                            # 转换为HU整数倍

                            s.wip_storage_hu = math.ceil(max(0, total_wip_storage) / upstream_hu) if upstream_hu > 0 else math.ceil(max(0, total_wip_storage))

                            s.wip_storage_absolute = s.wip_storage_hu * upstream_hu

                            s.wip_storage_upstream_name = ProcessStep.extract_english_name(upstream_process.name)  # 保存上游工序英文名称

                        else:

                            # 情况2：上游比下游快或持平

                            # 理论上不需要节拍缓冲，但仍需变异缓冲



                            # 变异缓冲 = 上游CV × 下游消耗速率 × 缓冲时长（1小时）

                            variability_buffer = upstream_process.cv_proc * downstream_consumption_rate * 3600



                            # 只有当变异缓冲足够大（超过0.5个HU）时才计算

                            # 避免极小值被向上取整为1 HU

                            if variability_buffer > upstream_hu * 0.5:

                                s.wip_storage_hu = math.ceil(variability_buffer / upstream_hu) if upstream_hu > 0 else math.ceil(variability_buffer)

                                s.wip_storage_absolute = s.wip_storage_hu * upstream_hu

                                s.wip_storage_upstream_name = ProcessStep.extract_english_name(upstream_process.name)  # 保存上游工序英文名称

                            else:

                                # 变异缓冲太小，不需要额外的WIP Storage

                                s.wip_storage_absolute = 0

                                s.wip_storage_hu = 0

                                s.wip_storage_upstream_name = ''



                    # 扩产后的WIP Storage计算

                    upstream_effective_cycle_time_proj = upstream_process.effective_time / upstream_process.num_machines

                    downstream_effective_cycle_time_proj = s.effective_time / s.total_machines_needed if s.total_machines_needed > 0 else s.effective_time



                    if upstream_effective_cycle_time_proj > 0 and downstream_effective_cycle_time_proj > 0:

                        if transport_interval > 0:

                            # 有中间转运的扩产后计算

                            cv_adjust_factor_proj = max(0.5, 1 - upstream_process.cv_proc * 0.2)

                            upstream_production_per_interval_proj = (transport_interval / upstream_effective_cycle_time_proj) * cv_adjust_factor_proj

                            downstream_consumption_per_interval_proj = transport_interval / downstream_effective_cycle_time_proj if downstream_effective_cycle_time_proj > 0 else 0

                            net_consumption_per_interval_proj = downstream_consumption_per_interval_proj - upstream_production_per_interval_proj



                            if net_consumption_per_interval_proj > 0:

                                arrivals_per_shift = shift_total_time / transport_interval

                                total_net_deficit_proj = net_consumption_per_interval_proj * arrivals_per_shift

                                # 使用上游工序的HU，必须是HU的整数倍

                                upstream_hu_proj = upstream_process.handling_unit if hasattr(upstream_process, 'handling_unit') and upstream_process.handling_unit > 0 else 1

                                s.wip_storage_hu_proj = math.ceil(max(0, total_net_deficit_proj) / upstream_hu_proj) if upstream_hu_proj > 0 else math.ceil(max(0, total_net_deficit_proj))

                                s.wip_storage_absolute_proj = s.wip_storage_hu_proj * upstream_hu_proj

                                s.wip_storage_upstream_name = ProcessStep.extract_english_name(upstream_process.name)  # 保存上游工序英文名称

                            else:

                                s.wip_storage_absolute_proj = 0

                                s.wip_storage_hu_proj = 0

                        else:

                            # 没有中间转运的扩产后计算

                            upstream_production_rate_proj = 1.0 / upstream_effective_cycle_time_proj

                            downstream_consumption_rate_proj = 1.0 / downstream_effective_cycle_time_proj

                            

                            if downstream_consumption_rate_proj > upstream_production_rate_proj:

                                net_consumption_rate_proj = downstream_consumption_rate_proj - upstream_production_rate_proj

                                target_continuous_hours = 12

                                target_continuous_seconds = target_continuous_hours * 3600

                                initial_wip_needed_proj = net_consumption_rate_proj * target_continuous_seconds

                                variability_buffer_proj = upstream_process.cv_proc * downstream_consumption_rate_proj * 3600

                                total_wip_storage_proj = initial_wip_needed_proj + variability_buffer_proj

                                

                                upstream_hu_proj = upstream_process.handling_unit if hasattr(upstream_process, 'handling_unit') and upstream_process.handling_unit > 0 else 1

                                s.wip_storage_hu_proj = math.ceil(max(0, total_wip_storage_proj) / upstream_hu_proj) if upstream_hu_proj > 0 else math.ceil(max(0, total_wip_storage_proj))

                                s.wip_storage_absolute_proj = s.wip_storage_hu_proj * upstream_hu_proj

                                s.wip_storage_upstream_name = ProcessStep.extract_english_name(upstream_process.name)  # 保存上游工序英文名称

                            else:

                                variability_buffer_proj = upstream_process.cv_proc * downstream_consumption_rate_proj * 3600

                                if variability_buffer_proj > upstream_hu_proj * 0.5:

                                    upstream_hu_proj = upstream_process.handling_unit if hasattr(upstream_process, 'handling_unit') and upstream_process.handling_unit > 0 else 1

                                    s.wip_storage_hu_proj = math.ceil(variability_buffer_proj / upstream_hu_proj) if upstream_hu_proj > 0 else math.ceil(variability_buffer_proj)

                                    s.wip_storage_absolute_proj = s.wip_storage_hu_proj * upstream_hu_proj

                                    s.wip_storage_upstream_name = ProcessStep.extract_english_name(upstream_process.name)  # 保存上游工序英文名称

                                else:

                                    s.wip_storage_absolute_proj = 0

                                    s.wip_storage_hu_proj = 0

                    else:

                        s.wip_storage_absolute_proj = 0

                        s.wip_storage_hu_proj = 0

                else:

                    s.wip_storage_absolute = 0

                    s.wip_storage_hu = 0

                    s.wip_storage_absolute_proj = 0

                    s.wip_storage_hu_proj = 0

            else:

                # 没有上游工序或班次时间为0，不需要WIP Storage

                s.wip_storage_absolute = 0

                s.wip_storage_hu = 0

                s.wip_storage_absolute_proj = 0

                s.wip_storage_hu_proj = 0



            # Update CV for next station (Arrival Variance)

            calc_util = min(s.utilization, 0.999)

            current_cv_arrival = math.sqrt(

                (calc_util ** 2 * s.cv_proc ** 2) +

                ((1 - calc_util ** 2) * s.current_cv_arrival ** 2)

            )

            if current_cv_arrival < 0: current_cv_arrival = 0.1



        results.append(s)



    return results, takt_time_final





# ==========================================

# 2. Configuration & Defaults

# ==========================================

DEFAULT_PROCESSES = [

    {"name": "激光切割", "time": 300.0, "machines": 2, "perf": 0.90, "avail": 0.95, "qual": 0.98, "cv": 0.3},

    {"name": "人工焊接", "time": 720.0, "machines": 3, "perf": 0.85, "avail": 0.90, "qual": 0.95, "cv": 0.6},

    {"name": "部件组装", "time": 480.0, "machines": 2, "perf": 0.92, "avail": 0.96, "qual": 0.99, "cv": 0.4},

    {"name": "最终包装", "time": 180.0, "machines": 1, "perf": 0.95, "avail": 0.98, "qual": 0.99, "cv": 0.2}

]



DEFAULT_SETTINGS = {

    "Demand (pcs/month)": 2000,

    "Days": 30,

    "Shifts_Per_Day": 2,

    "Hours_Per_Shift": 12,

    "Transport_Time (sec)": 0,

    "Transport_CV": 0.5

}



INPUT_FILE_NAME = "WIP_CapEx_Input_Template.xlsx"

OUTPUT_FILE_NAME = "WIP_CapEx_Analysis_Result.xlsx"





# ==========================================

# 3. Excel Handling Functions

# ==========================================



def create_input_template():

    print(f"📄 No input file found. Generating template: {INPUT_FILE_NAME} ...")



    df_processes = pd.DataFrame(DEFAULT_PROCESSES)

    df_processes.columns = [

        "工序名称 (Process Name)",

        "标准工时_秒 (Std Time_sec)",

        "机器数量 (Machine Count)",

        "性能效率_P (Perf Rate)",

        "可用性_A (Avail Rate)",

        "良率_Q (Qual Rate)",

        "变异系数_CV (Coeff of Var)"

    ]



    settings_list = [

        ["需求总量 (Demand)", "2000 (Specify unit: pcs/month or pcs/plan_period)"],

        ["计划天数 (Days)", "30"],

        ["每日班次 (Shifts/Day)", "2"],

        ["每班小时 (Hours/Shift)", "12"],

        ["目标利用率 (Target Utilization)", "0.85"],

        ["物流运输时间_秒 (Transport Time_sec)", "0"],

        ["运输变异系数 (Transport CV)", "0.5"]

    ]

    df_settings = pd.DataFrame(settings_list, columns=["参数项 (Parameter)", "数值 (Value)"])



    with pd.ExcelWriter(INPUT_FILE_NAME, engine='openpyxl') as writer:

        df_processes.to_excel(writer, sheet_name='Config_Processes', index=False)

        df_settings.to_excel(writer, sheet_name='Config_Settings', index=False)



        ws_set = writer.sheets['Config_Settings']

        ws_set.column_dimensions['A'].width = 35

        ws_set.column_dimensions['B'].width = 50



        ws_proc = writer.sheets['Config_Processes']

        for col in ws_proc.columns:

            max_len = 0

            for cell in col:

                try:

                    max_len = max(max_len, len(str(cell.value)))

                except:

                    pass

            ws_proc.column_dimensions[col[0].column_letter].width = min(max_len + 2, 25)



    print(f"✅ Template created: {os.path.abspath(INPUT_FILE_NAME)}")

    return False





def load_data_from_excel():

    try:

        df_settings = pd.read_excel(INPUT_FILE_NAME, sheet_name='Config_Settings')

        settings_dict = dict(zip(df_settings['参数项 (Parameter)'], df_settings['数值 (Value)']))



        def parse_val(key, default):

            val = settings_dict.get(key, default)

            if isinstance(val, str):

                import re

                nums = re.findall(r"[-+]?\d*\.\d+|\d+", val)

                return float(nums[0]) if nums else float(default)

            return float(val)



        demand = parse_val("需求总量 (Demand)", 2000)

        days = parse_val("计划天数 (Days)", 30)

        shifts = int(parse_val("每日班次 (Shifts/Day)", 2))

        hours = parse_val("每班小时 (Hours/Shift)", 12)

        trans_time = parse_val("物流运输时间_秒 (Transport Time_sec)", 0)

        trans_cv = parse_val("运输变异系数 (Transport CV)", 0.5)

        target_util = parse_val("目标利用率 (Target Utilization)", 0.85)



        demand_raw = settings_dict.get("需求总量 (Demand)", "")



        df_proc = pd.read_excel(INPUT_FILE_NAME, sheet_name='Config_Processes')

        df_proc = df_proc.dropna(subset=['工序名称 (Process Name)'])

        df_proc = df_proc[~df_proc['工序名称 (Process Name)'].astype(str).str.contains("---", na=False)]



        steps = []

        proc_steps = []

        

        # 先创建所有工艺步骤

        for _, row in df_proc.iterrows():

            # 读取分配百分比（如果列存在，否则默认100）
            alloc_pct = float(row.get('分配% (Alloc. %)', 100.0)) if '分配% (Alloc. %)' in row else 100.0

            step = ProcessStep(

                name=str(row['工序名称 (Process Name)']),

                std_proc_time=float(row['标准工时_秒 (Std Time_sec)']),

                num_machines=int(float(row['机器数量 (Machine Count)'])),

                perf_rate=float(row['性能效率_P (Perf Rate)']),

                avail_rate=float(row['可用性_A (Avail Rate)']),

                qual_rate=float(row['良率_Q (Qual Rate)']),

                cv_proc=float(row['变异系数_CV (Coeff of Var)']),

                is_transport=False,

                allocation_percentage=alloc_pct  # 优化4：读取分配百分比

            )

            proc_steps.append(step)

        

        # 在每两个相邻工艺之间添加运输步骤

        for i, proc_step in enumerate(proc_steps):

            steps.append(proc_step)

            

            # 如果不是最后一个工艺，且运输时间大于0，则添加运输步骤

            if trans_time > 0 and i < len(proc_steps) - 1:

                next_proc = proc_steps[i + 1]

                trans_step = ProcessStep(

                    name=f"运输 ({proc_step.name}→{next_proc.name})",

                    std_proc_time=trans_time,

                    num_machines=1,

                    perf_rate=1.0, avail_rate=1.0, qual_rate=1.0,

                    cv_proc=trans_cv,

                    is_transport=True

                )

                steps.append(trans_step)



        available_time = days * shifts * hours * 3600



        return {

            "steps": steps,

            "demand": demand,

            "available_time": available_time,

            "settings": {

                "days": days, "shifts": shifts, "hours": hours,

                "demand": demand, "trans_time": trans_time,

                "demand_raw_str": str(demand_raw),

                "target_util": target_util

            }

        }

    except Exception as e:

        print(f"❌ Error reading Excel: {e}")

        return None





def save_results_to_excel(results, takt_time, data_info, filename):

    if os.path.exists(filename):

        try:

            with open(filename, 'a'):

                pass

        except IOError:

            print(f"\n❌ ERROR: The file '{filename}' is currently OPEN in Excel.")

            print("   Please CLOSE the Excel file and then press Enter to retry...")

            input("   (Waiting...)")

            try:

                with open(filename, 'a'):

                    pass

            except IOError:

                return



    table_data = []

    proc_count = 0



    for r in results:

        if not r.is_transport:

            proc_count += 1

            r.step_index = proc_count

        else:

            r.step_index = None



    for r in results:

        idx_str = str(r.step_index) if r.step_index else ""



        if r.is_overloaded:

            status = "🔴 超载 (Overloaded)"

        elif r.utilization > 0.85:

            status = "🟡 高风险 (High Risk)"

        else:

            status = "🟢 健康 (Healthy)"



        wip_total_curr = int(r.wip_int) if r.wip_int < 9999 else "High"

        wip_total_proj = int(r.wip_int_proj)

        oee_str = f"{r.oee_value:.1%}" if not r.is_transport else "-"



        # 设置工作天数（从Settings来）

        scheduled_days_str = f"{r.scheduled_days}" if r.scheduled_days else "-"



        # 基于设置天数的产出

        if r.is_transport:

            output_scheduled_str = "-"

        else:

            output_scheduled = r.output_based_on_scheduled_days

            output_scheduled_str = f"{int(round(output_scheduled))}" if output_scheduled > 0 else "-"



        # 建议天数

        if r.recommended_days is None:

            recommended_days_str = "-"

        else:

            recommended_days_str = f"{r.recommended_days}"



        # 基于建议天数的产出

        if r.is_transport:

            output_recommended_str = "-"

        else:

            output_recommended = r.output_based_on_recommended_days

            output_recommended_str = f"{int(round(output_recommended))}" if output_recommended > 0 else "-"



        # WIP Storage 显示（绝对值和HU个数）

        if r.is_transport:

            wip_storage_display = "-"

        else:

            wip_abs = r.wip_storage_absolute

            wip_hu = r.wip_storage_hu

            upstream_name = r.wip_storage_upstream_name if hasattr(r, 'wip_storage_upstream_name') and r.wip_storage_upstream_name else ProcessStep.extract_english_name(r.name)

            if wip_abs > 0:

                # 绝对值已经是HU的整数倍，直接显示为整数

                wip_storage_display = f"{int(wip_abs)} ({wip_hu}HU/{upstream_name})"

            else:

                wip_storage_display = "0"



        row = {

            "序号 (ID)": idx_str,

            "工序名称 (Process Name)": r.name,

            "标准工时_秒 (Std Time_sec)": round(r.std_proc_time, 2),

            "OEE (A×P×Q, with breaks)": oee_str,

            "天产能 (Day Capacity)": f"{int(round(r.day_capacity))}" if not r.is_transport and hasattr(r, 'day_capacity') and r.day_capacity > 0 else "-",

            "良率_Q (Qual)": f"{r.qual_rate:.2f}" if not r.is_transport else "-",

            "需加工数量 (Adj. Demand)": int(round(r.adjusted_demand)),

            "设置工作天数 (Scheduled Days)": scheduled_days_str,

            "基于设置天数的产出 (Output on Scheduled)": output_scheduled_str,

            "建议天数 (Recommended Days)": recommended_days_str,

            "基于建议天数的产出 (Output on Recommended)": output_recommended_str,

            "当前台数 (Curr Machines)": r.num_machines,

            "需增台数 (Add Machines)": r.additional_machines if (r.utilization > 1.0 and r.additional_machines > 0) else 0,

            "当前利用率 (Curr Util)": f"{r.utilization:.1%}" if not r.is_transport else "-",

            "扩产后利用率 (Proj Util)": f"{r.projected_utilization:.1%}" if not r.is_transport else "-",

            "HU (Handling Unit)": r.handling_unit if not r.is_transport else "-",

            "分配% (Alloc. %)": f"{r.allocation_percentage:.0f}%" if hasattr(r, 'allocation_percentage') else "100%",

            "WIP Storage (件/HU)": wip_storage_display,

            "状态 (Status)": status

        }

        table_data.append(row)



    df_result = pd.DataFrame(table_data)



    total_new = sum(r.additional_machines for r in results if r.is_overloaded)

    # 计算总WIP Storage（仅非运输工序）
    total_wip_storage_absolute = sum(r.wip_storage_absolute_proj for r in results if not r.is_transport)
    total_wip_storage_hu = sum(r.wip_storage_hu_proj for r in results if not r.is_transport)

    non_transport_steps = [r for r in results if not r.is_transport]

    if non_transport_steps:

        bottleneck = max(non_transport_steps, key=lambda x: x.utilization).name

    else:

        bottleneck = "None"



    summary_data = [

        ["Final Demand", f"{int(data_info['settings']['demand'])}"],

        ["System Takt Time (Final)", f"{takt_time:.2f} sec"],

        ["Total Machines to Add", total_new],

        ["Total WIP Storage (件/pieces)", f"{int(round(total_wip_storage_absolute))}"],

        ["Total WIP Storage (HU)", f"{total_wip_storage_hu}"],

        ["Bottleneck Process", bottleneck],

        ["Generated At", datetime.now().strftime("%Y-%m-%d %H:%M:%S")]

    ]

    df_summary = pd.DataFrame(summary_data, columns=["Item", "Value"])



    try:

        with pd.ExcelWriter(filename, engine='openpyxl') as writer:

            df_result.to_excel(writer, sheet_name='Analysis_Result', index=False)

            df_summary.to_excel(writer, sheet_name='Summary', index=False)



            for sheet in ['Analysis_Result', 'Summary']:

                ws = writer.sheets[sheet]

                for col in ws.columns:

                    max_len = 0

                    for cell in col:

                        try:

                            max_len = max(max_len, len(str(cell.value)))

                        except:

                            pass

                    ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 25)



        print(f"✅ Analysis Complete! Saved to: {os.path.abspath(filename)}")

        print("   - Includes 'Adjusted Demand' column reflecting scrap accumulation.")

    except PermissionError:

        print(f"\n❌ ERROR: Failed to write to '{filename}'. File is open.")

    except Exception as e:

        print(f"\n❌ Unexpected error: {e}")





def export_to_html(results, takt_time, data_info, filename):

    """导出分析结果为 HTML 文件"""

    

    # 构建工序流程表格

    process_rows = ""

    transport_rows = ""

    

    for r in results:

        if r.is_transport:

            # 运输步骤

            status_class = "healthy"

            status_text = "🟢 健康"

            transport_rows += f"""

            <tr class="transport-row" data-from="{r.name.split('→')[0].replace('运输 (', '')}" data-to="{r.name.split('→')[1].replace(')', '')}">

                <td class="transport-cell">🚚</td>

                <td class="transport-name">{r.name}</td>

                <td>{r.std_proc_time:.0f}s</td>

                <td>-</td>

                <td>-</td>

                <td>{int(round(r.adjusted_demand))}</td>

                <td>{r.effective_capacity:.1f}</td>

                <td>{r.num_machines}</td>

                <td>-</td>

                <td>0</td>

                <td>-</td>

                <td>{r.wip_int_proj}</td>

                <td><span class="status-badge {status_class}">{status_text}</span></td>

            </tr>"""

        else:

            # 工艺步骤

            if r.is_overloaded:

                status_class = "overloaded"

                status_text = "🔴 超载"

            elif r.utilization > 0.85:

                status_class = "high-risk"

                status_text = "🟡 高风险"

            else:

                status_class = "healthy"

                status_text = "🟢 健康"

            

            oee_str = f"{r.oee_value:.1%}" if not r.is_transport else "-"

            util_str = f"{r.utilization:.1%}" if not r.is_transport else "-"

            proj_util_str = f"{r.projected_utilization:.1%}" if not r.is_transport else "-"

            qual_str = f"{r.qual_rate:.2f}" if not r.is_transport else "-"

            

            process_rows += f"""

            <tr class="process-row" data-step="{r.step_index or ''}">

                <td class="step-index">{r.step_index or ''}</td>

                <td class="process-name">{r.name}</td>

                <td>{r.std_proc_time:.2f}</td>

                <td>{oee_str}</td>

                <td>{qual_str}</td>

                <td>{int(round(r.adjusted_demand))}</td>

                <td>{r.effective_capacity:.1f}</td>

                <td>{r.num_machines}</td>

                <td class="utilization-cell" data-util="{r.utilization:.2%}">{util_str}</td>

                <td class="add-machines">{r.additional_machines if r.is_overloaded else 0}</td>

                <td class="proj-util">{proj_util_str}</td>

                <td class="target-wip">{r.wip_int_proj}</td>

                <td><span class="status-badge {status_class}">{status_text}</span></td>

            </tr>"""

    

    # 计算汇总数据

    total_new = sum(r.additional_machines for r in results if r.is_overloaded)

    total_wip = sum(r.wip_int_proj for r in results)

    

    non_transport = [r for r in results if not r.is_transport]

    if non_transport:

        bottleneck = max(non_transport, key=lambda x: x.utilization)

        bottleneck_name = bottleneck.name

        bottleneck_util = bottleneck.utilization

    else:

        bottleneck_name = "无"

        bottleneck_util = 0

    

    # 运输时间汇总

    transport_steps = [r for r in results if r.is_transport]

    total_transport_time = sum(r.std_proc_time for r in transport_steps)

    

    # 生成 HTML

    html_content = f"""<!DOCTYPE html>

<html lang="zh-CN">

<head>

    <meta charset="UTF-8">

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>精益 WIP & CapEx 主计划分析</title>

    <style>

        :root {{

            --primary: #2563eb;

            --primary-dark: #1d4ed8;

            --success: #22c55e;

            --warning: #eab308;

            --danger: #ef4444;

            --gray-50: #f9fafb;

            --gray-100: #f3f4f6;

            --gray-200: #e5e7eb;

            --gray-300: #d1d5db;

            --gray-600: #4b5563;

            --gray-700: #374151;

            --gray-800: #1f2937;

            --gray-900: #111827;

        }}

        

        * {{

            margin: 0;

            padding: 0;

            box-sizing: border-box;

        }}

        

        body {{

            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

            min-height: 100vh;

            padding: 2rem;

        }}

        

        .container {{

            max-width: 1400px;

            margin: 0 auto;

        }}

        

        .header {{

            background: white;

            border-radius: 12px;

            padding: 2rem;

            margin-bottom: 2rem;

            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);

        }}

        

        .header h1 {{

            color: var(--gray-900);

            font-size: 2rem;

            margin-bottom: 0.5rem;

        }}

        

        .header .subtitle {{

            color: var(--gray-600);

            font-size: 0.9rem;

        }}

        

        .summary-cards {{

            display: grid;

            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

            gap: 1rem;

            margin-bottom: 2rem;

        }}

        

        .card {{

            background: white;

            border-radius: 12px;

            padding: 1.5rem;

            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);

        }}

        

        .card .label {{

            color: var(--gray-600);

            font-size: 0.85rem;

            margin-bottom: 0.5rem;

        }}

        

        .card .value {{

            color: var(--gray-900);

            font-size: 1.8rem;

            font-weight: 700;

        }}

        

        .card .unit {{

            color: var(--gray-600);

            font-size: 0.9rem;

            margin-left: 0.25rem;

        }}

        

        .main-table {{

            background: white;

            border-radius: 12px;

            overflow: hidden;

            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);

            margin-bottom: 2rem;

        }}

        

        .table-header {{

            background: var(--gray-800);

            color: white;

            padding: 1rem 1.5rem;

            display: flex;

            justify-content: space-between;

            align-items: center;

        }}

        

        .table-header h2 {{

            font-size: 1.25rem;

        }}

        

        .controls {{

            display: flex;

            gap: 0.5rem;

        }}

        

        .btn {{

            padding: 0.5rem 1rem;

            border: none;

            border-radius: 6px;

            cursor: pointer;

            font-size: 0.85rem;

            transition: all 0.2s;

        }}

        

        .btn-primary {{

            background: var(--primary);

            color: white;

        }}

        

        .btn-primary:hover {{

            background: var(--primary-dark);

        }}

        

        .btn-outline {{

            background: transparent;

            border: 1px solid var(--gray-300);

            color: var(--gray-700);

        }}

        

        .btn-outline:hover {{

            background: var(--gray-100);

        }}

        

        table {{

            width: 100%;

            border-collapse: collapse;

        }}

        

        thead th {{

            background: var(--gray-100);

            padding: 0.75rem 1rem;

            text-align: left;

            font-size: 0.8rem;

            color: var(--gray-600);

            text-transform: uppercase;

            border-bottom: 2px solid var(--gray-200);

        }}

        

        tbody td {{

            padding: 0.75rem 1rem;

            border-bottom: 1px solid var(--gray-100);

            font-size: 0.9rem;

        }}

        

        tbody tr:hover {{

            background: var(--gray-50);

        }}

        

        .transport-row {{

            background: #fef3c7 !important;

        }}

        

        .transport-row:hover {{

            background: #fde68a !important;

        }}

        

        .transport-cell {{

            font-size: 1.2rem;

        }}

        

        .transport-name {{

            color: var(--gray-700);

            font-style: italic;

        }}

        

        .process-name {{

            font-weight: 600;

            color: var(--gray-800);

        }}

        

        .step-index {{

            color: var(--gray-600);

            text-align: center;

        }}

        

        .utilization-cell {{

            position: relative;

        }}

        

        .util-bar {{

            position: absolute;

            left: 0;

            top: 0;

            height: 100%;

            opacity: 0.2;

            transition: width 0.3s;

        }}

        

        .util-low {{

            background: var(--success);

        }}

        

        .util-medium {{

            background: var(--warning);

        }}

        

        .util-high {{

            background: var(--danger);

        }}

        

        .status-badge {{

            padding: 0.25rem 0.5rem;

            border-radius: 4px;

            font-size: 0.75rem;

            font-weight: 600;

        }}

        

        .status-badge.healthy {{

            background: #dcfce7;

            color: #166534;

        }}

        

        .status-badge.high-risk {{

            background: #fef9c3;

            color: #854d0e;

        }}

        

        .status-badge.overloaded {{

            background: #fee2e2;

            color: #991b1b;

        }}

        

        .flow-diagram {{

            background: white;

            border-radius: 12px;

            padding: 2rem;

            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);

            margin-bottom: 2rem;

        }}

        

        .flow-diagram h2 {{

            margin-bottom: 1.5rem;

            color: var(--gray-900);

        }}

        

        .flow-container {{

            display: flex;

            flex-wrap: wrap;

            align-items: center;

            gap: 0.5rem;

        }}

        

        .flow-step {{

            padding: 0.75rem 1rem;

            border-radius: 8px;

            font-size: 0.85rem;

            font-weight: 600;

            text-align: center;

            min-width: 100px;

        }}

        

        .flow-step.process {{

            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);

            color: white;

        }}

        

        .flow-step.transport {{

            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);

            color: white;

        }}

        

        .flow-arrow {{

            color: var(--gray-400);

            font-size: 1.2rem;

        }}

        

        .footer {{

            text-align: center;

            color: white;

            padding: 1rem;

            font-size: 0.85rem;

        }}

        

        @media (max-width: 768px) {{

            body {{

                padding: 1rem;

            }}

            

            .summary-cards {{

                grid-template-columns: repeat(2, 1fr);

            }}

            

            .table-header {{

                flex-direction: column;

                gap: 1rem;

            }}

            

            table {{

                font-size: 0.75rem;

            }}

            

            thead th, tbody td {{

                padding: 0.5rem;

            }}

        }}

    </style>

</head>

<body>

    <div class="container">

        <div class="header">

            <h1>🏭 精益 WIP & CapEx 主计划分析</h1>

            <p class="subtitle">Lean WIP & CapEx Master Plan | 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>

        </div>

        

        <div class="summary-cards">

            <div class="card">

                <div class="label">最终需求</div>

                <div class="value">{int(data_info['settings']['demand'])}<span class="unit">件</span></div>

            </div>

            <div class="card">

                <div class="label">系统节拍时间</div>

                <div class="value">{takt_time:.2f}<span class="unit">秒</span></div>

            </div>

            <div class="card">

                <div class="label">瓶颈工序</div>

                <div class="value" style="font-size: 1.2rem;">{bottleneck_name}</div>

                <div class="unit">利用率: {bottleneck_util:.1%}</div>

            </div>

            <div class="card">

                <div class="label">需增加设备</div>

                <div class="value">{total_new}<span class="unit">台</span></div>

            </div>

            <div class="card">

                <div class="label">系统 WIP 目标</div>

                <div class="value">{total_wip}<span class="unit">件</span></div>

            </div>

            <div class="card">

                <div class="label">总运输时间</div>

                <div class="value">{total_transport_time:.0f}<span class="unit">秒</span></div>

            </div>

        </div>

        

        <div class="flow-diagram">

            <h2>📊 工艺流程图</h2>

            <div class="flow-container">

                {''.join([f"""

                <div class="flow-step {'transport' if r.is_transport else 'process'}">

                    {r.name}

                    <br><small>{r.std_proc_time:.0f}s</small>

                </div>

                <div class="flow-arrow">→</div>""" for r in results[:-1]])}

                <div class="flow-step {'transport' if results[-1].is_transport else 'process'}">

                    {results[-1].name}

                    <br><small>{results[-1].std_proc_time:.0f}s</small>

                </div>

            </div>

        </div>

        

        <div class="main-table">

            <div class="table-header">

                <h2>📋 详细分析结果</h2>

                <div class="controls">

                    <button class="btn btn-outline" onclick="showAll()">显示全部</button>

                    <button class="btn btn-outline" onclick="showProcesses()">仅显示工艺</button>

                    <button class="btn btn-outline" onclick="showTransports()">仅显示运输</button>

                    <button class="btn btn-primary" onclick="window.print()">🖨️ 打印</button>

                </div>

            </div>

            <table>

                <thead>

                    <tr>

                        <th>序号</th>

                        <th>工序名称</th>

                        <th>标准工时 (秒)</th>

                        <th>OEE</th>

                        <th>良率</th>

                        <th>需加工数量</th>

                        <th>有效产能</th>

                        <th>当前台数</th>

                        <th>当前利用率</th>

                        <th>需增台数</th>

                        <th>扩产后利用率</th>

                        <th>建议 WIP</th>

                        <th>状态</th>

                    </tr>

                </thead>

                <tbody>

                    {process_rows}

                    {transport_rows}

                </tbody>

            </table>

        </div>

        

        <div class="footer">

            <p>Lean WIP & CapEx Master Plan v4.07 | Generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>

        </div>

    </div>

    

    <script>

        function showAll() {{

            document.querySelectorAll('.process-row, .transport-row').forEach(row => {{

                row.style.display = '';

            }});

        }}

        

        function showProcesses() {{

            document.querySelectorAll('.process-row').forEach(row => {{

                row.style.display = '';

            }});

            document.querySelectorAll('.transport-row').forEach(row => {{

                row.style.display = 'none';

            }});

        }}

        

        function showTransports() {{

            document.querySelectorAll('.process-row').forEach(row => {{

                row.style.display = 'none';

            }});

            document.querySelectorAll('.transport-row').forEach(row => {{

                row.style.display = '';

            }});

        }}

        

        // 添加利用率进度条

        document.querySelectorAll('.utilization-cell').forEach(cell => {{

            const util = parseFloat(cell.dataset.util);

            if (!isNaN(util)) {{

                const bar = document.createElement('div');

                bar.className = 'util-bar';

                bar.style.width = (util * 100) + '%';

                

                if (util < 0.7) {{

                    bar.classList.add('util-low');

                }} else if (util < 0.85) {{

                    bar.classList.add('util-medium');

                }} else {{

                    bar.classList.add('util-high');

                }}

                

                cell.style.position = 'relative';

                cell.insertBefore(bar, cell.firstChild);

            }}

        }});

    </script>

</body>

</html>"""

    

    try:

        html_filename = filename.replace('.xlsx', '.html')

        with open(html_filename, 'w', encoding='utf-8') as f:

            f.write(html_content)

        print(f"✅ HTML 报告已生成: {os.path.abspath(html_filename)}")

    except Exception as e:

        print(f"❌ 生成 HTML 报告失败: {e}")





def main():

    print("🚀 Lean WIP & CapEx Master Plan (v3.0 - Rolled Yield Logic)")

    print("=" * 60)



    if not os.path.exists(INPUT_FILE_NAME):

        create_input_template()

        return



    print(f"📂 Found input file: {INPUT_FILE_NAME}")

    print("⏳ Calculating with Scrap Accumulation Logic...")



    data = load_data_from_excel()

    if not data:

        return



    results, takt_time = calculate_wip_scenario(

        data['steps'],

        data['demand'],

        data['available_time'],

        scheduled_days=data['settings']['days'],

        shifts_per_day=data['settings']['shifts'],

        hours_per_shift=data['settings']['hours'],

        target_util=data['settings'].get('target_util', 0.85)

    )

    if not results:

        print("❌ Calculation failed.")

        return



    save_results_to_excel(results, takt_time, data, OUTPUT_FILE_NAME)

    

    # 同时生成 HTML 报告

    export_to_html(results, takt_time, data, OUTPUT_FILE_NAME)



    total_new = sum(r.additional_machines for r in results if r.is_overloaded)

    print("\n--- Quick Summary ---")

    print(f"Final Demand: {int(data['settings']['demand'])}")

    print(f"Takt Time (Final): {takt_time:.2f}s")

    print(f"Action: {'Add ' + str(total_new) + ' machines' if total_new > 0 else 'No investment needed'}")

    print("---------------------")





if __name__ == "__main__":

    main()