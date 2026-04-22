#include <iomanip>
#include <iostream>
#include <cmath>
#include <algorithm>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

struct ElasticMaterial {
    double density_kg_m3;
    double youngs_modulus_pa;
    double poisson_ratio;
};

struct ConcretePrism {
    double width_m;
    double depth_m;
    double height_m;
    ElasticMaterial material;
};

struct GroundDomain {
    double depth_m;
    ElasticMaterial material;
};

struct CoupledBoundaryState {
    double contact_shape_factor;
    double coupling_ratio;
    double equivalent_ground_modulus_pa;
    double equivalent_specimen_modulus_pa;
    double max_contact_pressure_pa;
    double min_contact_pressure_pa;
};

struct StressReport {
    double area_m2;
    CoupledBoundaryState boundary;
    double volume_m3;
    double mass_kg;
    double self_weight_n;
    double applied_load_n;
    double self_weight_stress_pa;
    double applied_load_stress_pa;
    double combined_stress_pa;
};

constexpr double gravity_m_s2 = 9.80665;
constexpr double pi = 3.14159265358979323846;

double calculate_equivalent_modulus_pa(const ElasticMaterial& material) {
    const double denominator = std::max(1e-6, 1.0 - material.poisson_ratio * material.poisson_ratio);
    return material.youngs_modulus_pa / denominator;
}

double calculate_contact_pressure_multiplier(
    const ConcretePrism& prism,
    const CoupledBoundaryState& boundary,
    double x_m,
    double z_m) {
    const double half_width_m = std::max(prism.width_m * 0.5, 1e-6);
    const double half_depth_m = std::max(prism.depth_m * 0.5, 1e-6);
    const double x_norm = std::clamp(std::abs(x_m) / half_width_m, 0.0, 1.0);
    const double z_norm = std::clamp(std::abs(z_m) / half_depth_m, 0.0, 1.0);
    const double edge_mode = std::pow(x_norm, 4.0) + std::pow(z_norm, 4.0) - 0.4;
    const double corner_mode = std::pow(x_norm, 2.0) * std::pow(z_norm, 2.0) - (1.0 / 9.0);
    const double multiplier =
        1.0 + boundary.contact_shape_factor * (0.82 * edge_mode + 0.28 * corner_mode);

    return std::max(0.35, multiplier);
}

CoupledBoundaryState calculate_coupled_boundary_state(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double average_contact_pressure_pa) {
    const double equivalent_specimen_modulus_pa = calculate_equivalent_modulus_pa(prism.material);
    const double equivalent_ground_modulus_pa = calculate_equivalent_modulus_pa(ground.material);
    const double characteristic_length_m = std::sqrt(std::max(prism.width_m * prism.depth_m, 1e-6));
    const double coupling_ratio = std::clamp(
        (equivalent_specimen_modulus_pa * characteristic_length_m) /
            std::max(equivalent_ground_modulus_pa * std::max(prism.height_m, 1e-6), 1e-6),
        0.05,
        25.0
    );
    const double contact_shape_factor = std::clamp(
        0.08 + 0.12 * std::log10(1.0 + coupling_ratio),
        0.04,
        0.32
    );
    const double center_multiplier = calculate_contact_pressure_multiplier(prism, {
        contact_shape_factor,
        coupling_ratio,
        equivalent_ground_modulus_pa,
        equivalent_specimen_modulus_pa,
        0.0,
        0.0,
    }, 0.0, 0.0);
    const double edge_multiplier = calculate_contact_pressure_multiplier(
        prism,
        {
            contact_shape_factor,
            coupling_ratio,
            equivalent_ground_modulus_pa,
            equivalent_specimen_modulus_pa,
            0.0,
            0.0,
        },
        prism.width_m * 0.5,
        prism.depth_m * 0.5
    );

    return {
        contact_shape_factor,
        coupling_ratio,
        equivalent_ground_modulus_pa,
        equivalent_specimen_modulus_pa,
        average_contact_pressure_pa * std::max(center_multiplier, edge_multiplier),
        average_contact_pressure_pa * std::min(center_multiplier, edge_multiplier),
    };
}

StressReport calculate_stress_report(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double applied_load_n) {
    const double area_m2 = prism.width_m * prism.depth_m;
    const double volume_m3 = area_m2 * prism.height_m;
    const double mass_kg = prism.material.density_kg_m3 * volume_m3;
    const double self_weight_n = mass_kg * gravity_m_s2;
    const double self_weight_stress_pa = self_weight_n / area_m2;
    const double applied_load_stress_pa = applied_load_n / area_m2;
    const double combined_stress_pa = self_weight_stress_pa + applied_load_stress_pa;
    const CoupledBoundaryState boundary =
        calculate_coupled_boundary_state(prism, ground, combined_stress_pa);

    return {
        area_m2,
        boundary,
        volume_m3,
        mass_kg,
        self_weight_n,
        applied_load_n,
        self_weight_stress_pa,
        applied_load_stress_pa,
        combined_stress_pa,
    };
}

bool is_inside_prism(const ConcretePrism& prism, double x_m, double y_m, double z_m) {
    return std::abs(x_m) <= prism.width_m * 0.5 &&
           std::abs(z_m) <= prism.depth_m * 0.5 &&
           y_m >= -prism.height_m * 0.5 &&
           y_m <= prism.height_m * 0.5;
}

double calculate_boussinesq_footing_stress_increment_pa(
    const ConcretePrism& prism,
    const StressReport& report,
    const CoupledBoundaryState& boundary,
    double depth_below_surface_m,
    double x_m,
    double z_m) {
    if (depth_below_surface_m <= 0.0) {
        return 0.0;
    }

    const bool is_inside_footprint =
        std::abs(x_m) <= prism.width_m * 0.5 &&
        std::abs(z_m) <= prism.depth_m * 0.5;
    const double shallow_cutoff_m = std::max(1e-4, std::min(prism.width_m, prism.depth_m) * 0.02);

    if (depth_below_surface_m <= shallow_cutoff_m) {
        return is_inside_footprint ? report.combined_stress_pa : 0.0;
    }

    const double uniform_pressure_pa = report.combined_stress_pa;
    const int steps_x = std::clamp(
        static_cast<int>(std::ceil(prism.width_m / std::max(prism.width_m / 26.0, depth_below_surface_m * 0.18))),
        14,
        30
    );
    const int steps_z = std::clamp(
        static_cast<int>(std::ceil(prism.depth_m / std::max(prism.depth_m / 26.0, depth_below_surface_m * 0.18))),
        14,
        30
    );
    const double sample_width_m = prism.width_m / static_cast<double>(steps_x);
    const double sample_depth_m = prism.depth_m / static_cast<double>(steps_z);
    double stress_increment_pa = 0.0;

    for (int x_index = 0; x_index < steps_x; ++x_index) {
        const double sample_x_m =
            -prism.width_m * 0.5 + (static_cast<double>(x_index) + 0.5) * sample_width_m;

        for (int z_index = 0; z_index < steps_z; ++z_index) {
            const double sample_z_m =
                -prism.depth_m * 0.5 + (static_cast<double>(z_index) + 0.5) * sample_depth_m;
            const double dx_m = x_m - sample_x_m;
            const double dz_m = z_m - sample_z_m;
            const double radius_squared_m2 =
                dx_m * dx_m + dz_m * dz_m + depth_below_surface_m * depth_below_surface_m;
            const double sample_pressure_pa =
                uniform_pressure_pa *
                calculate_contact_pressure_multiplier(prism, boundary, sample_x_m, sample_z_m);
            const double sample_load_n = sample_pressure_pa * sample_width_m * sample_depth_m;
            const double kernel =
                (3.0 * std::pow(depth_below_surface_m, 3.0)) /
                (2.0 * pi * std::pow(radius_squared_m2, 2.5));

            stress_increment_pa += sample_load_n * kernel;
        }
    }

    return stress_increment_pa;
}

double calculate_stress_at_point_pa(
    const ConcretePrism& prism,
    const GroundDomain& ground,
    double applied_load_n,
    double x_m,
    double y_m,
    double z_m) {
    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    const double ground_top_y_m = -prism.height_m * 0.5;

    if (is_inside_prism(prism, x_m, y_m, z_m)) {
        const double cover_to_top_m = prism.height_m * 0.5 - y_m;
        const double normalized_depth = std::clamp(cover_to_top_m / std::max(prism.height_m, 1e-6), 0.0, 1.0);
        const double base_multiplier =
            calculate_contact_pressure_multiplier(prism, report.boundary, x_m, z_m);
        const double coupled_increment_pa =
            (base_multiplier - 1.0) * report.combined_stress_pa * std::pow(normalized_depth, 1.15);

        return report.applied_load_stress_pa +
               prism.material.density_kg_m3 * gravity_m_s2 * cover_to_top_m +
               coupled_increment_pa;
    }

    if (y_m < ground_top_y_m && y_m >= ground_top_y_m - ground.depth_m) {
        const double depth_below_surface_m = ground_top_y_m - y_m;
        const double geostatic_stress_pa =
            ground.material.density_kg_m3 * gravity_m_s2 * depth_below_surface_m;
        const double footing_increment_pa = calculate_boussinesq_footing_stress_increment_pa(
            prism,
            report,
            report.boundary,
            depth_below_surface_m,
            x_m,
            z_m
        );

        return geostatic_stress_pa + footing_increment_pa;
    }

    return 0.0;
}

void print_report(const ConcretePrism& prism, const GroundDomain& ground, const StressReport& report) {
    const double self_weight_stress_kpa = report.self_weight_stress_pa / 1000.0;
    const double applied_load_stress_kpa = report.applied_load_stress_pa / 1000.0;
    const double combined_stress_kpa = report.combined_stress_pa / 1000.0;
    const double combined_stress_mpa = report.combined_stress_pa / 1'000'000.0;

    std::cout << std::fixed << std::setprecision(4);
    std::cout << "Concrete prism stress demo\n";
    std::cout << "================================\n\n";
    std::cout << "Geometry:\n";
    std::cout << "  width  = " << prism.width_m << " m\n";
    std::cout << "  depth  = " << prism.depth_m << " m\n";
    std::cout << "  height = " << prism.height_m << " m\n";
    std::cout << "  density = " << prism.material.density_kg_m3 << " kg/m^3\n";
    std::cout << "  specimen E = " << prism.material.youngs_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  specimen nu = " << prism.material.poisson_ratio << "\n";
    std::cout << "  ground E = " << ground.material.youngs_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  ground nu = " << ground.material.poisson_ratio << "\n\n";

    std::cout << "Step 1: area\n";
    std::cout << "  A = width x depth\n";
    std::cout << "  A = " << prism.width_m << " x " << prism.depth_m << " = " << report.area_m2 << " m^2\n\n";

    std::cout << "Step 2: volume\n";
    std::cout << "  V = A x height\n";
    std::cout << "  V = " << report.area_m2 << " x " << prism.height_m << " = " << report.volume_m3 << " m^3\n\n";

    std::cout << "Step 3: mass\n";
    std::cout << "  m = density x V\n";
    std::cout << "  m = " << prism.material.density_kg_m3 << " x " << report.volume_m3 << " = " << report.mass_kg << " kg\n\n";

    std::cout << "Step 4: self-weight\n";
    std::cout << "  W = m x g\n";
    std::cout << "  W = " << report.mass_kg << " x 9.80665 = " << report.self_weight_n << " N\n\n";

    std::cout << "Step 5: self-weight stress field\n";
    std::cout << "  sigma_self(y) increases linearly toward the base\n";
    std::cout << "  sigma_self,top = 0 Pa\n";
    std::cout << "  sigma_self,base = W / A\n";
    std::cout << "  sigma_self,base = " << report.self_weight_n << " / " << report.area_m2 << " = "
              << report.self_weight_stress_pa << " Pa\n";
    std::cout << "  sigma_self,base = " << self_weight_stress_kpa << " kPa\n\n";

    std::cout << "Step 6: applied top load stress\n";
    std::cout << "  sigma_P = P / A\n";
    std::cout << "  sigma_P = " << report.applied_load_n << " / " << report.area_m2 << " = "
              << report.applied_load_stress_pa << " Pa\n";
    std::cout << "  sigma_P = " << applied_load_stress_kpa << " kPa\n";
    std::cout << "  sigma_P is uniform through the prism\n\n";

    std::cout << "Step 7: total axial stress field\n";
    std::cout << "  sigma(y) = sigma_P + sigma_self(y)\n";
    std::cout << "  sigma_top_surface = sigma_P = " << report.applied_load_stress_pa << " Pa\n";
    std::cout << "  sigma_base = sigma_P + sigma_self,base\n";
    std::cout << "  sigma_base = " << report.applied_load_stress_pa << " + "
              << report.self_weight_stress_pa << " = " << report.combined_stress_pa << " Pa\n";
    std::cout << "  sigma_base = " << combined_stress_kpa << " kPa\n";
    std::cout << "  sigma_base = " << combined_stress_mpa << " MPa\n";
    std::cout << "  The stress therefore varies linearly from " << applied_load_stress_kpa
              << " kPa at the top to " << combined_stress_kpa << " kPa at the base.\n\n";

    std::cout << "Base-stress identity for this two-load demo:\n";
    std::cout << "  sigma_base = density x g x height + P / A\n";
    std::cout << "  sigma_base = " << prism.material.density_kg_m3 << " x 9.80665 x " << prism.height_m
              << " + " << report.applied_load_n << " / " << report.area_m2 << " = "
              << report.combined_stress_pa << " Pa\n";
    std::cout << "\nCoupled boundary note:\n";
    std::cout << "  Equivalent specimen modulus = " << report.boundary.equivalent_specimen_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  Equivalent ground modulus = " << report.boundary.equivalent_ground_modulus_pa / 1'000'000.0 << " MPa\n";
    std::cout << "  Coupling ratio = " << report.boundary.coupling_ratio << "\n";
    std::cout << "  Contact shape factor = " << report.boundary.contact_shape_factor << "\n";
    std::cout << "  Base contact range = "
              << report.boundary.min_contact_pressure_pa / 1000.0
              << " to "
              << report.boundary.max_contact_pressure_pa / 1000.0
              << " kPa\n";
    std::cout << "\nSpatial field note:\n";
    std::cout << "  The browser viewer now samples sigma(x, y, z).\n";
    std::cout << "  Inside the prism it blends from a uniform top load to a coupled elastic contact pressure at the base.\n";
    std::cout << "  In the ground it uses a Boussinesq elastic half-space integration for a rectangular footing,\n";
    std::cout << "  plus geostatic stress from the same density.\n";
}

extern "C" {

EMSCRIPTEN_KEEPALIVE double calculate_combined_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n) {
    const ConcretePrism prism{
        width_m,
        depth_m,
        height_m,
        {
            density_kg_m3,
            specimen_youngs_modulus_mpa * 1'000'000.0,
            specimen_poisson_ratio,
        },
    };
    const GroundDomain ground{
        std::max(height_m * 1.5, std::max(width_m, depth_m) * 4.0),
        {
            density_kg_m3,
            ground_youngs_modulus_mpa * 1'000'000.0,
            ground_poisson_ratio,
        },
    };

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    return report.boundary.max_contact_pressure_pa;
}

EMSCRIPTEN_KEEPALIVE void print_stress_report(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n) {
    const ConcretePrism prism{
        width_m,
        depth_m,
        height_m,
        {
            density_kg_m3,
            specimen_youngs_modulus_mpa * 1'000'000.0,
            specimen_poisson_ratio,
        },
    };
    const GroundDomain ground{
        std::max(height_m * 1.5, std::max(width_m, depth_m) * 4.0),
        {
            density_kg_m3,
            ground_youngs_modulus_mpa * 1'000'000.0,
            ground_poisson_ratio,
        },
    };

    const StressReport report = calculate_stress_report(prism, ground, applied_load_n);
    print_report(prism, ground, report);
}

EMSCRIPTEN_KEEPALIVE double calculate_self_weight_stress_pa(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3) {
    return calculate_combined_stress_pa(width_m, depth_m, height_m, density_kg_m3, 30'000.0, 0.2, 120.0, 0.3, 0.0);
}

EMSCRIPTEN_KEEPALIVE double calculate_stress_at_point_pa_export(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3,
    double specimen_youngs_modulus_mpa,
    double specimen_poisson_ratio,
    double ground_youngs_modulus_mpa,
    double ground_poisson_ratio,
    double applied_load_n,
    double ground_depth_m,
    double x_m,
    double y_m,
    double z_m) {
    const ConcretePrism prism{
        width_m,
        depth_m,
        height_m,
        {
            density_kg_m3,
            specimen_youngs_modulus_mpa * 1'000'000.0,
            specimen_poisson_ratio,
        },
    };
    const GroundDomain ground{
        ground_depth_m,
        {
            density_kg_m3,
            ground_youngs_modulus_mpa * 1'000'000.0,
            ground_poisson_ratio,
        },
    };

    return calculate_stress_at_point_pa(
        prism,
        ground,
        applied_load_n,
        x_m,
        y_m,
        z_m
    );
}

EMSCRIPTEN_KEEPALIVE void print_self_weight_report(
    double width_m,
    double depth_m,
    double height_m,
    double density_kg_m3) {
    print_stress_report(width_m, depth_m, height_m, density_kg_m3, 30'000.0, 0.2, 120.0, 0.3, 0.0);
}

} // extern "C"

int main() {
#ifndef __EMSCRIPTEN__
    const ConcretePrism prism{
        0.10,
        0.10,
        1.00,
        {
            2400.0,
            30'000'000'000.0,
            0.2,
        },
    };
    const GroundDomain ground{
        1.5,
        {
            2400.0,
            120'000'000.0,
            0.3,
        },
    };

    const StressReport report = calculate_stress_report(prism, ground, 2500.0);
    print_report(prism, ground, report);
#endif
    return 0;
}
